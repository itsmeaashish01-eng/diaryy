#!/usr/bin/env node
/* ================================================
   PRICE WATCH — browser-price.mjs

   Reads a price off a real booking page by driving a real browser.

   This is for sites with no API — Amtrak, most rail and coach operators,
   plenty of hotels. It loads the page you give it, lets the site's own
   JavaScript run, then reads the fares out of the rendered text.

   Why text and not CSS selectors: selectors break the week a site
   reshuffles its markup, and break *silently*. Reading the money out of
   the visible text survives redesigns, and when it does go wrong it goes
   wrong loudly — you get "no prices found" or a figure outside the sanity
   band, not a confidently wrong number.

   ---- first run ----
   Do the search on the site by hand, copy the URL of the results page,
   then look at what this sees:

     node browser-price.mjs --url "<results page URL>" --discover --headed

   That prints every money figure it found with the text around it, and
   marks which ones it would count. Read that list before trusting it:
   a page's cheapest number is often NOT a fare — gift cards, baggage
   fees and "from $X" promos all look like money. Narrow it with --near
   until only real fares are marked, then drop --discover:

     node browser-price.mjs --url "<same URL>" --min 20 --near "coach|business"
     → {"price":87,"currency":"USD"}

   ---- options ----
     --url <url>        results page to read            (required)
     --min <n>          ignore figures below this       (default 5)
     --max <n>          ignore figures above this       (default 5000)
     --near <regex>     only count figures whose surrounding text matches
                        (e.g. "coach|business|saver") — the sharpest filter
     --not <regex>      never count figures near this text; defaults to the
                        usual decoys (gift cards, bag fees, insurance)
     --currency <code>  reported back with the price    (default USD)
     --wait <ms>        extra settle time after load    (default 6000)
     --expect <text>    wait for this text before reading
     --headed           show the browser (harder to detect, good for debugging)
     --discover         dump everything found, save a screenshot, pick nothing
     --shot <path>      where to save the screenshot    (default ./price-shot.png)
     --timeout <ms>     hard cap on the whole run       (default 90000)

   ---- before you point this at a site ----
   Check its terms. Poll it hourly at most — you are asking a real server
   for a real page. And expect commercial sites with bot protection to
   block datacenter IP addresses: this generally works from a home
   connection and generally does not from a CI runner.
   ================================================ */

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};

const url = arg("--url", "");
const min = Number(arg("--min", 5));
const max = Number(arg("--max", 5000));
const near = arg("--near", "");
/* Amounts that sit next to these words are almost never the fare. Pass
   --not "" to switch this off. */
const notPattern = arg(
  "--not",
  "gift card|gift certificate|bag fee|baggage|change fee|insurance|deposit|" +
  "voucher|credit|per bag|reward|points|membership|subscri"
);
const currency = arg("--currency", "USD");
const settle = Number(arg("--wait", 6000));
const expect = arg("--expect", "");
const headed = has("--headed");
const discover = has("--discover");
const shot = arg("--shot", "./price-shot.png");
const timeout = Number(arg("--timeout", 90000));

const fail = (msg) => {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
};

if (!url) fail("Missing --url. Search on the site by hand, then pass the results page URL.");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (e) {
  fail(
    "Playwright isn't installed. Run:  npm install playwright && npx playwright install chromium"
  );
}

/* Money in rendered text. Handles $1,234.50 / $87 / US$87.00 and the
   same shapes for £ and €. The capture group is the bare number.
   The trailing lookahead stops a malformed figure being read as a
   truncated one — "$1,03.00" must not come back as 1. */
const MONEY = /(?:US)?[$£€]\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d,])/g;

const nearRe = near ? new RegExp(near, "i") : null;
const notRe = notPattern ? new RegExp(notPattern, "i") : null;

/* Why a figure was or wasn't counted — shown in --discover so the
   filters can be tuned by looking rather than by guessing. */
function judge(f) {
  if (f.value < min || f.value > max) return "band";
  if (notRe && notRe.test(f.context)) return "excluded";
  if (nearRe && !nearRe.test(f.context)) return "not near";
  return null;
}

const browser = await chromium.launch({
  headless: !headed,
  args: ["--disable-blink-features=AutomationControlled"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    locale: "en-US",
    // A default Playwright UA advertises itself as automation on many sites.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout });

  // Booking results arrive well after DOMContentLoaded.
  if (expect) {
    await page.getByText(expect, { exact: false }).first()
      .waitFor({ timeout }).catch(() => {});
  } else {
    await page.waitForFunction(
      () => /[$£€]\s?\d/.test(document.body.innerText),
      null,
      { timeout: Math.min(timeout, 45000) }
    ).catch(() => {});
  }
  await page.waitForTimeout(settle);

  const text = await page.evaluate(() => document.body.innerText || "");

  /* Context is the LINE the figure sits on, not a window of characters
     around it. Booking pages put one fare per row, so the line is the
     unit that actually belongs together — a character window straddles
     neighbouring fares and makes every filter bleed across rows. */
  const found = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    MONEY.lastIndex = 0;
    let m;
    while ((m = MONEY.exec(line)) !== null) {
      const value = parseFloat(m[1].replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      found.push({ value, context: line.slice(0, 160) });
    }
  }

  const kept = found.filter((f) => judge(f) === null);

  if (discover) {
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`Page title : ${await page.title()}`);
    console.log(`Screenshot : ${shot}`);
    console.log(`Band       : ${min}–${max}`);
    console.log(`Near       : ${near || "(not set — every figure in band counts)"}`);
    console.log(`Excluding  : ${notPattern || "(nothing)"}`);
    console.log(`\nFound ${found.length} money figures; ${kept.length} would be counted.\n`);
    for (const f of found) {
      const why = judge(f);
      console.log(
        `${why ? "×" : "✓"} ${String(f.value).padStart(9)}  ${(why || "counted").padEnd(9)}  …${f.context}…`
      );
    }
    if (kept.length) {
      console.log(`\nWould report: ${Math.min(...kept.map((f) => f.value))} ${currency}`);
      console.log("Check that figure really is the cheapest FARE above, not a fee or a promo.");
    } else {
      console.log("\nWould report: nothing — loosen the filters, or the page hadn't loaded fares yet.");
      console.log("Open the screenshot: if it shows a bot check or an empty search, that's your answer.");
    }
    process.exit(0);
  }

  const values = kept.map((f) => f.value);
  if (!values.length) {
    fail(
      `No fare passed the filters (band ${min}–${max}` +
      `${near ? `, near /${near}/` : ""}). ` +
      `Re-run with --discover --headed to see what it actually loaded.`
    );
  }

  // The cheapest fare on the page is what a fare watch is about.
  console.log(JSON.stringify({ price: Math.min(...values), currency }));
} catch (e) {
  fail(String((e && e.message) || e));
} finally {
  await browser.close();
}
