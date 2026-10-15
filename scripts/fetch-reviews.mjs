// Pulls rating + reviews from our JustDial listing into data/reviews.json.
// Run by .github/workflows/reviews.yml on a schedule; also runnable locally: node scripts/fetch-reviews.mjs
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";

const LISTING = "https://jsdl.in/DT-43YEA226QIA";
const OUT = new URL("../data/reviews.json", import.meta.url);

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || undefined, args: ["--disable-http2"] });
const page = await browser.newPage({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
});
await page.goto(LISTING, { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(600);
}

const data = await page.evaluate(() => {
  const txt = (el) => (el ? el.innerText.trim() : "");
  const body = document.body.innerText;
  const m = body.match(/Reviews & Ratings\s+([\d.]+)\s+(\d+) Ratings/);
  const reviews = [...document.querySelectorAll(".review_box")].map((box) => ({
    name: txt(box.querySelector("h3")),
    date: txt(box.querySelector(".revw_star_right .color555")),
    stars: Number((box.querySelector("svg.revw_star")?.getAttribute("title") || "").replace(/\D/g, "")) || null,
    // Long reviews arrive truncated ("...READ MORE"); the site links out for the full text.
    text: txt(box.querySelector(".revw_star_text"))
      .replace(/\s*READ MORE$/i, "")
      .replace(/\\(["'`])/g, "$1")
      .replace(/`/g, "'")
      .replace(/\s*\.\.\.$/, "…"),
  }));
  return { rating: m ? Number(m[1]) : null, count: m ? Number(m[2]) : null, reviews };
});
await browser.close();

const reviews = data.reviews.filter((r) => r.name && r.text);
// Refuse to overwrite good data with an empty/blocked scrape.
if (!data.rating || reviews.length === 0) {
  console.error("Scrape returned no data; keeping existing reviews.json", data);
  process.exit(1);
}

const out = {
  source: LISTING,
  rating: data.rating,
  count: data.count,
  updated: new Date().toISOString(),
  reviews,
};
const prev = (() => { try { return readFileSync(OUT, "utf8"); } catch { return ""; } })();
const next = JSON.stringify(out, null, 2) + "\n";
// Only the timestamp changed → don't rewrite (keeps git history quiet).
const strip = (s) => s.replace(/"updated": "[^"]*",?\n/, "");
if (strip(prev) === strip(next)) {
  console.log("No change");
  process.exit(0);
}
writeFileSync(OUT, next);
console.log(`Saved ${out.rating}★ / ${out.count} ratings, ${reviews.length} reviews`);

// Bake the reviews into index.html so crawlers that don't run JS still see them.
const HTML = new URL("../index.html", import.meta.url);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const title = (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const top = reviews
  .filter((r) => (r.stars || 5) >= 4 && r.text.length > 20)
  .map((r) => ({ ...r, cut: r.text.endsWith("…") }))
  // complete reviews first, then highest stars, then the most detailed
  .sort((a, b) => a.cut - b.cut || (b.stars || 0) - (a.stars || 0) || b.text.length - a.text.length)
  .slice(0, 7);
const quotes = top
  .map(
    (r) => `          <blockquote>
            <p>${esc(r.text)}</p>
            <footer>${esc(title(r.name))} · <span aria-label="${r.stars || 5} out of 5 stars">${"★".repeat(r.stars || 5)}</span> · ${esc(r.date)}</footer>
          </blockquote>`
  )
  .join("\n");
const synced = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const html = readFileSync(HTML, "utf8")
  .replace(/(<!-- reviews:start[^>]*-->)[\s\S]*?(\s*<!-- reviews:end -->)/, `$1\n${quotes}$2`)
  .replace(/(data-rating>)[^<]*/g, `$1${out.rating}`)
  .replace(/(data-count>)[^<]*/g, `$1${out.count}`)
  .replace(/(data-updated>)[^<]*/, `$1Updated from JustDial on ${synced}`);
writeFileSync(HTML, html);
