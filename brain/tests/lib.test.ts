import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCapture } from "@/lib/capture";
import { toCsv } from "@/lib/csv";
import { addMonths, formatDueDate, isIsoDate, nextOccurrence } from "@/lib/dates";
import { docToMarkdown, docToText, extractItemLinks, sanitizeDoc, textToDoc, type RTNode } from "@/lib/rich-text";
import { highlightSegments, scoreMatch, tokenize } from "@/lib/search";
import { detectSecret } from "@/lib/secrets";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import { extractHashtags, normalizeTag } from "@/lib/tags";
import { domainOf, isProbablyUrl, isSafeHref, normalizeUrl } from "@/lib/url";
import { createZip, crc32, safeFileName } from "@/lib/zip";
import { parseHead } from "@/server/metadata";

describe("url safety", () => {
  it("normalises bare domains and rejects dangerous schemes", () => {
    expect(normalizeUrl("example.com/x")).toBe("https://example.com/x");
    expect(normalizeUrl("http://nih.gov")).toBe("http://nih.gov/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<script>")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeUrl("mailto:a@b.com", "any")).toBe("mailto:a@b.com");
    expect(normalizeUrl("onepassword://open/item", "any")).toBe("onepassword://open/item");
  });

  it("only allows safe hrefs", () => {
    expect(isSafeHref("https://a.org")).toBe(true);
    expect(isSafeHref("/items/abc")).toBe(true);
    expect(isSafeHref("//evil.com")).toBe(false);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref(" JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeHref("vbscript:x")).toBe(false);
  });

  it("detects URLs and domains", () => {
    expect(isProbablyUrl("https://oklahoma.gov/health")).toBe(true);
    expect(isProbablyUrl("nih.gov")).toBe(true);
    expect(isProbablyUrl("hello world")).toBe(false);
    expect(isProbablyUrl("e.g.")).toBe(false);
    expect(domainOf("https://www.example.com/a")).toBe("example.com");
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
  });

  it("clamps month arithmetic to the end of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("computes the next occurrence after today", () => {
    expect(nextOccurrence("2026-10-03", "DAILY", "2026-10-03")).toBe("2026-10-04");
    // a week overdue daily task lands on tomorrow, not still in the past
    expect(nextOccurrence("2026-09-26", "DAILY", "2026-10-03")).toBe("2026-10-04");
    // Friday → Monday
    expect(nextOccurrence("2026-10-02", "WEEKDAYS", "2026-10-01")).toBe("2026-10-05");
    expect(nextOccurrence("2026-10-03", "WEEKLY", "2026-10-03")).toBe("2026-10-10");
    expect(nextOccurrence("2026-01-31", "MONTHLY", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(null, "YEARLY", "2026-10-03")).toBe("2027-10-03");
    expect(nextOccurrence("2026-10-03", "NONE", "2026-10-03")).toBeNull();
  });

  it("formats due dates relative to today", () => {
    expect(formatDueDate("2026-10-03", "2026-10-03")).toBe("Today");
    expect(formatDueDate("2026-10-04", "2026-10-03")).toBe("Tomorrow");
    expect(formatDueDate("2026-10-02", "2026-10-03")).toBe("Yesterday");
    expect(formatDueDate("2026-12-25", "2026-10-03")).toBe("Dec 25");
    expect(formatDueDate("2027-01-05", "2026-10-03")).toBe("Jan 5, 2027");
  });
});

describe("capture", () => {
  it("turns a URL into a bookmark with tags", () => {
    const r = parseCapture("https://nih.gov/grants #research #read-later");
    expect(r).toMatchObject({ type: "BOOKMARK", url: "https://nih.gov/grants", tags: ["research", "read-later"] });
  });

  it("uses text around a URL as the title", () => {
    const r = parseCapture("Waiver guidance\nhttps://oklahoma.gov/health");
    expect(r).toMatchObject({ type: "BOOKMARK", title: "Waiver guidance", url: "https://oklahoma.gov/health" });
  });

  it("recognises tasks and notes", () => {
    expect(parseCapture("todo: call the board")).toMatchObject({ type: "TASK", title: "call the board" });
    expect(parseCapture("[] buy milk")).toMatchObject({ type: "TASK", title: "buy milk" });
    expect(parseCapture("Idea: trial tracker")).toMatchObject({ type: "NOTE", title: "trial tracker", tags: ["idea"] });
    expect(parseCapture("Line one\nline two")).toMatchObject({ type: "NOTE", title: "Line one", body: "line two" });
    expect(parseCapture("   ")).toBeNull();
  });

  it("falls back to a note when a bookmark has no URL", () => {
    expect(parseCapture("just words", "BOOKMARK")?.type).toBe("NOTE");
  });
});

describe("rich text", () => {
  const doc: RTNode = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          { type: "text", text: "portal", marks: [{ type: "link", attrs: { href: "https://a.org" } }] },
          { type: "text", text: " and " },
          { type: "itemLink", attrs: { id: "abc", label: "Waiver" } },
          { type: "text", text: " now", marks: [{ type: "bold" }] },
        ],
      },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }] },
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "todo" }] }] },
        ],
      },
    ],
  };

  it("extracts plain text, links and markdown", () => {
    expect(docToText(doc)).toBe("Plan\nSee portal and Waiver now\ndone\ntodo");
    expect(extractItemLinks(doc)).toEqual(["abc"]);
    expect(docToMarkdown(doc)).toBe("## Plan\n\nSee [portal](https://a.org) and [[Waiver]] **now**\n\n- [x] done\n- [ ] todo");
  });

  it("strips unsafe link marks", () => {
    const evil: RTNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)", onclick: "x" } }] }] }],
    };
    expect(JSON.stringify(sanitizeDoc(evil))).not.toContain("javascript");
  });

  it("linkifies URLs in plain text", () => {
    const d = textToDoc("go to https://a.org/x.");
    expect(d.content?.[0]?.content?.[1]?.marks?.[0]?.attrs?.href).toBe("https://a.org/x");
  });
});

describe("search ranking", () => {
  it("tokenises with quoted phrases and hashtags", () => {
    expect(tokenize('Conrad 30 "j-1 waiver" #urgent')).toEqual(["conrad", "30", "j-1 waiver", "urgent"]);
  });

  it("requires every token and prefers title matches", () => {
    const titled = scoreMatch(["conrad", "30"], { title: "Conrad 30 waiver", searchText: "conrad 30 waiver", tags: [] });
    const body = scoreMatch(["conrad", "30"], { title: "Letter", searchText: "letter about conrad 30", tags: [] });
    const missing = scoreMatch(["conrad", "31"], { title: "Conrad 30", searchText: "conrad 30", tags: [] });
    expect(titled).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(0);
    expect(missing).toBe(0);
  });

  it("splits text for highlighting without losing characters", () => {
    const parts = highlightSegments("Oklahoma Health Dept", ["health"]);
    expect(parts.map((p) => p.text).join("")).toBe("Oklahoma Health Dept");
    expect(parts.find((p) => p.hit)?.text).toBe("Health");
  });
});

describe("tags", () => {
  it("normalises names", () => {
    expect(normalizeTag("#Read Later")).toBe("read-later");
    expect(normalizeTag("  ##J-1 Waiver!! ")).toBe("j-1-waiver");
    expect(normalizeTag("###")).toBe("");
    expect(extractHashtags("call #urgent re #job, not a#b")).toEqual(["urgent", "job"]);
  });
});

describe("secret detection", () => {
  it("flags credentials and card numbers but not ordinary text", () => {
    expect(detectSecret("password: hunter22")).toBe("a password");
    expect(detectSecret("api_key=abcdef1234567890XYZ")).toBe("an API key or token");
    expect(detectSecret("card 4111 1111 1111 1111")).toBe("a card number");
    expect(detectSecret("Recovery codes: 1234-5678")).toBe("recovery codes");
    expect(detectSecret("Reset your password via the portal")).toBeNull();
    expect(detectSecret("NPI 1234567890 and phone 405-555-0100")).toBeNull();
  });
});

describe("csv", () => {
  it("quotes and defuses formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", '=1+1'], ['say "hi"', null]])).toBe('a,b\r\n"x,y",\'=1+1\r\n"say ""hi""",\r\n');
  });
});

describe("zip", () => {
  it("matches the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("produces an archive `unzip` can read", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "brain-zip-"));
    const file = path.join(dir, "t.zip");
    writeFileSync(file, createZip([
      { path: "README.md", data: "hello" },
      { path: "Professional/Licensing/Ünïcode note.md", data: "# Title\n\nbody" },
    ]));
    let listing = "";
    try {
      listing = execFileSync("unzip", ["-l", file], { encoding: "utf8" });
    } catch {
      return; // unzip not installed: the CRC test above still covers the format
    }
    expect(listing).toContain("Professional/Licensing/Ünïcode note.md");
    execFileSync("unzip", ["-o", "-q", file, "-d", dir]);
    expect(readFileSync(path.join(dir, "README.md"), "utf8")).toBe("hello");
  });

  it("makes safe file names", () => {
    expect(safeFileName('a/b:c*?"<>|')).toBe("a-b-c------");
    expect(safeFileName("...")).toBe("untitled");
  });
});

describe("sessions", () => {
  it("accepts its own tokens and rejects forged or expired ones", async () => {
    const token = await createSessionToken("secret-1");
    expect(await verifySessionToken(token, "secret-1")).toBe(true);
    expect(await verifySessionToken(token, "secret-2")).toBe(false);
    expect(await verifySessionToken(token.replace(/.$/, "x"), "secret-1")).toBe(false);
    expect(await verifySessionToken(undefined, "secret-1")).toBe(false);
    const old = await createSessionToken("secret-1", Date.now() - 40 * 86_400_000);
    expect(await verifySessionToken(old, "secret-1")).toBe(false);
  });
});

describe("page metadata parsing", () => {
  it("reads title, description and icon from <head>", () => {
    const html = `<html><head><title>Fallback &amp; title</title>
      <meta property="og:title" content="Oklahoma &#39;Health&#39;">
      <meta name="description" content="State health dept">
      <link rel="apple-touch-icon" href="/apple.png"><link rel="icon" href="/fav.ico"></head></html>`;
    expect(parseHead(html, "https://oklahoma.gov/x")).toEqual({
      title: "Oklahoma 'Health'",
      description: "State health dept",
      icon: "https://oklahoma.gov/fav.ico",
    });
  });
});
