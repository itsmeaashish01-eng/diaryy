// End-to-end checks of the service layer against a real (temporary) SQLite
// database: the workflows the app exists for.
import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase } from "./support/test-db";

freshDatabase();

const items = await import("@/server/items");
const folders = await import("@/server/folders");
const tags = await import("@/server/tags");
const { search } = await import("@/server/search");
const { dashboard, counts } = await import("@/server/dashboard");
const backup = await import("@/server/backup");

const TODAY = "2026-10-03";

describe("tasks", () => {
  it("creates, completes and reopens a task", async () => {
    const task = await items.createItem({ type: "TASK", title: "Submit Oklahoma waiver", dueDate: TODAY, priority: "HIGH" });
    expect(task.task?.status).toBe("TODO");
    const done = await items.setTaskDone(task.id, true, TODAY);
    expect(done.task?.status).toBe("DONE");
    expect(done.task?.completedAt).not.toBeNull();
    const reopened = await items.setTaskDone(task.id, false, TODAY);
    expect(reopened.task?.status).toBe("TODO");
    expect(reopened.task?.completedAt).toBeNull();
  });

  it("rolls a recurring task forward instead of closing it", async () => {
    const task = await items.createItem({ type: "TASK", title: "Weekly review", dueDate: "2026-10-01", recurrence: "WEEKLY" });
    const parentSub = await items.createItem({ type: "TASK", title: "Inbox zero", parentId: task.id });
    await items.setTaskDone(parentSub.id, true, TODAY);
    const next = await items.setTaskDone(task.id, true, TODAY);
    expect(next.task?.status).toBe("TODO");
    expect(next.task?.dueDate).toBe("2026-10-08");
    expect(next.task?.lastCompletedAt).not.toBeNull();
    expect(next.subtasks[0]?.task?.status).toBe("TODO");
  });

  it("lists overdue, today and upcoming tasks by due date", async () => {
    await items.createItem({ type: "TASK", title: "Late thing", dueDate: "2026-09-30" });
    await items.createItem({ type: "TASK", title: "Future thing", dueDate: "2026-10-05" });
    const overdue = await items.listItems({ view: "overdue", today: TODAY });
    expect(overdue.map((t) => t.title)).toContain("Late thing");
    const upcoming = await items.listItems({ view: "upcoming", today: TODAY });
    expect(upcoming.map((t) => t.title)).toEqual(expect.arrayContaining(["Future thing", "Weekly review"]));
    const dash = await dashboard(TODAY);
    expect(dash.overdue.map((t) => t.title)).toContain("Late thing");
    const c = await counts(TODAY);
    expect(c.overdue).toBeGreaterThanOrEqual(1);
  });

  it("keeps subtasks out of the main list and deletes them with the parent", async () => {
    const parent = await items.createItem({ type: "TASK", title: "Parent task" });
    const child = await items.createItem({ type: "TASK", title: "Child task", parentId: parent.id });
    const all = await items.listItems({ type: "TASK", view: "all" });
    expect(all.map((t) => t.id)).not.toContain(child.id);
    expect((await items.getItem(parent.id)).subtasks.map((s) => s.id)).toEqual([child.id]);
    await items.deleteItem(parent.id);
    await expect(items.getItem(child.id)).rejects.toThrow("not found");
  });
});

describe("notes, bookmarks, search", () => {
  let noteId = "";
  let bookmarkId = "";

  beforeAll(async () => {
    const note = await items.createItem({ type: "NOTE", title: "Oklahoma Conrad 30 Requirements", text: "Need J-1 waiver letter" });
    noteId = note.id;
    const bm = await items.createItem({
      type: "BOOKMARK",
      url: "https://oklahoma.gov/health.html",
      title: "Oklahoma Department of Health",
      tags: ["#Conrad 30", "waiver"],
    });
    bookmarkId = bm.id;
  });

  it("saves rich text, strips unsafe links and keeps a plain-text copy", async () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Portal", marks: [{ type: "link", attrs: { href: "https://example.org/" } }] },
            { type: "text", text: " evil", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
          ],
        },
      ],
    };
    const note = await items.updateItem(noteId, { content: JSON.stringify(doc) });
    expect(note.note?.contentText).toBe("Portal evil");
    expect(note.note?.content).toContain("https://example.org/");
    expect(note.note?.content).not.toContain("javascript:");
  });

  it("normalises tags and bookmark domains", async () => {
    const bm = await items.getItem(bookmarkId);
    expect(bm.tags.map((t) => t.name)).toEqual(["conrad-30", "waiver"]);
    expect(bm.bookmark?.domain).toBe("oklahoma.gov");
  });

  it('finds every kind of item for "Conrad 30"', async () => {
    const task = await items.createItem({ type: "TASK", title: "Email Conrad 30 coordinator" });
    const hits = await search("Conrad 30");
    const ids = hits.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining([noteId, bookmarkId, task.id]));
    expect(hits.find((h) => h.id === noteId)?.kind).toBe("NOTE");
  });

  it("finds items by URL, tag and folder path", async () => {
    expect((await search("oklahoma.gov")).map((h) => h.id)).toContain(bookmarkId);
    expect((await search("#waiver")).map((h) => h.id)).toContain(bookmarkId);
    const parent = await folders.createFolder("Professional");
    const child = await folders.createFolder("Licensing", parent.id);
    await items.updateItem(bookmarkId, { folderId: child.id });
    expect((await search("licensing")).map((h) => h.id)).toEqual(expect.arrayContaining([bookmarkId, child.id]));
    // Renaming the parent re-indexes items in the child folder.
    await folders.updateFolder(parent.id, { name: "Career Stuff" });
    expect((await search("career stuff")).map((h) => h.id)).toContain(bookmarkId);
  });

  it("does not return archived items unless asked", async () => {
    const n = await items.createItem({ type: "NOTE", title: "Zebra archive test" });
    await items.updateItem(n.id, { archived: true });
    expect(await search("zebra")).toHaveLength(0);
    expect((await search("zebra", { includeArchived: true })).map((h) => h.id)).toEqual([n.id]);
  });
});

describe("relations", () => {
  it("links a task to a note both ways and unlinks it", async () => {
    const task = await items.createItem({ type: "TASK", title: "Submit waiver packet" });
    const note = await items.createItem({ type: "NOTE", title: "Waiver checklist" });
    await items.addRelation(task.id, note.id);
    expect((await items.getItem(task.id)).related.map((r) => r.id)).toEqual([note.id]);
    expect((await items.getItem(note.id)).related.map((r) => r.id)).toEqual([task.id]);
    await items.removeRelation(note.id, task.id);
    expect((await items.getItem(task.id)).related).toHaveLength(0);
  });

  it("keeps [[wiki links]] in notes and task text in sync", async () => {
    const target = await items.createItem({ type: "NOTE", title: "Oklahoma Waiver" });
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "itemLink", attrs: { id: target.id, label: "Oklahoma Waiver" } }] }],
    };
    const note = await items.createItem({ type: "NOTE", title: "Plan", content: JSON.stringify(doc) });
    expect((await items.getItem(target.id)).related.map((r) => r.id)).toContain(note.id);
    await items.updateItem(note.id, { content: JSON.stringify({ type: "doc", content: [] }) });
    expect((await items.getItem(target.id)).related.map((r) => r.id)).not.toContain(note.id);

    const task = await items.createItem({ type: "TASK", title: "Follow up", description: "See [[oklahoma waiver]]" });
    expect((await items.getItem(task.id)).related.map((r) => r.id)).toEqual([target.id]);
  });
});

describe("inbox, folders, tags", () => {
  it("captures a URL as an inbox bookmark and a todo as an inbox task", async () => {
    const bm = await items.captureItem("https://www.nih.gov/grants #research");
    expect(bm.type).toBe("BOOKMARK");
    expect(bm.inbox).toBe(true);
    expect(bm.tags.map((t) => t.name)).toEqual(["research"]);
    const task = await items.captureItem("todo renew DEA license");
    expect(task.type).toBe("TASK");
    expect(task.task?.status).toBe("INBOX");
    const organised = await items.updateItem(task.id, { inbox: false });
    expect(organised.task?.status).toBe("TODO");
    expect(organised.inbox).toBe(false);
  });

  it("converts an inbox note into a task, keeping its text", async () => {
    const note = await items.captureItem("Call the licensing board\nAsk about timeline");
    expect(note.type).toBe("NOTE");
    const task = await items.updateItem(note.id, { type: "TASK" });
    expect(task.type).toBe("TASK");
    expect(task.task?.description).toBe("Ask about timeline");
  });

  it("deleting a folder keeps its items and subfolders", async () => {
    const top = await folders.createFolder("Medicine");
    const mid = await folders.createFolder("Stroke", top.id);
    const leaf = await folders.createFolder("Papers", mid.id);
    const note = await items.createItem({ type: "NOTE", title: "Thrombectomy trial", folderId: mid.id });
    await folders.deleteFolder(mid.id);
    const after = await items.getItem(note.id);
    expect(after.folder?.id).toBe(top.id);
    const list = await folders.listFolders();
    expect(list.find((f) => f.id === leaf.id)?.parentId).toBe(top.id);
    await expect(folders.updateFolder(top.id, { parentId: leaf.id })).rejects.toThrow("inside itself");
  });

  it("reorders folders among siblings", async () => {
    const a = await folders.createFolder("Alpha-order");
    const b = await folders.createFolder("Beta-order");
    await folders.moveFolder(b.id, "up");
    const list = (await folders.listFolders()).filter((f) => f.parentId === null).map((f) => f.id);
    expect(list.indexOf(b.id)).toBeLessThan(list.indexOf(a.id));
  });

  it("renames a tag onto an existing one by merging", async () => {
    const x = await items.createItem({ type: "NOTE", title: "Tag merge", tags: ["read-later"] });
    await items.createItem({ type: "NOTE", title: "Tag merge 2", tags: ["toread"] });
    const all = await tags.listTags();
    const toread = all.find((t) => t.name === "toread")!;
    await tags.renameTag(toread.id, "Read Later");
    const merged = (await tags.listTags()).find((t) => t.name === "read-later");
    expect(merged?.count).toBe(2);
    expect((await items.listItems({ tag: "read-later" })).map((i) => i.id)).toContain(x.id);
  });
});

describe("export and restore", () => {
  it("round-trips everything through JSON", async () => {
    const before = await backup.exportJson();
    expect(before.items.length).toBeGreaterThan(5);
    const result = await backup.importJson(JSON.parse(JSON.stringify(before)), "replace");
    expect(result.items).toBe(before.items.length);
    const after = await backup.exportJson();
    const strip = (d: typeof before) => ({ ...d, exportedAt: "" });
    expect(strip(after)).toEqual(strip(before));
  });

  it("rejects files that are not a backup without changing anything", async () => {
    const count = (await backup.exportJson()).items.length;
    await expect(backup.importJson({ hello: "world" }, "replace")).rejects.toThrow("not a Brain backup");
    expect((await backup.exportJson()).items.length).toBe(count);
  });

  it("writes CSV and a Markdown zip", async () => {
    const csv = await backup.exportCsv("tasks");
    expect(csv.split("\r\n")[0]).toContain("title");
    expect(csv).toContain("Submit Oklahoma waiver");
    const zip = await backup.exportMarkdownZip();
    expect(Buffer.from(zip.slice(0, 2)).toString()).toBe("PK");
  });
});
