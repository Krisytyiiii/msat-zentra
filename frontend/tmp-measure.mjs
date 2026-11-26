import { chromium } from "playwright";

const css = [
  "/_next/static/chunks/%5Broot-of-the-server%5D__1045ykf975o1m._.css",
  "/_next/static/chunks/src_components_landing_0i4vfm3l99cxx._.css",
]
  .map((p) => `<link rel="stylesheet" href="http://localhost:3000${p}">`)
  .join("");

const markup = `
<div style="padding:20px;width:420px;background:#0a0a0a">
<span class="mt-1 flex max-w-full flex-wrap items-center gap-1.5">
  <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border bg-transparent px-2 py-0.5 text-[12px] font-semibold border-border text-foreground h-6 leading-none">213123123123</span>
  <span aria-hidden class="h-3.5 w-px shrink-0 self-center bg-border"></span>
  <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border bg-transparent px-2 py-0.5 text-[12px] font-semibold border-green-500/45 text-green-700 h-6 leading-none">Low</span>
</span>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 300 } });
await page.setContent(`<!doctype html><html class="dark"><head>${css}</head><body>${markup}</body></html>`);
await page.waitForTimeout(500);
const rects = await page.evaluate(() =>
  [...document.querySelectorAll("span.inline-flex")].map((el) => {
    const r = el.getBoundingClientRect();
    return { text: el.textContent, top: r.top, bottom: r.bottom, height: r.height };
  }),
);
console.log(JSON.stringify(rects, null, 2));
await browser.close();
