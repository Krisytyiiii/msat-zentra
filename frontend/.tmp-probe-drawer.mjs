import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => console.log("[console]", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(`${BASE}/login/admin`, { waitUntil: "networkidle" });
  await page.fill("#email", "admin@zentra.test");
  await page.fill("#password", "Admin2025!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/admin/, { timeout: 20000 });
  console.log("logged in:", page.url());

  const probe = async (label, openFn) => {
    await openFn();
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="sheet-content"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        cls: el.className,
        dataState: el.getAttribute("data-state"),
        dataOpen: el.hasAttribute("data-open"),
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        transition: cs.transitionProperty + " " + cs.transitionDuration,
        transform: cs.transform,
        parent: el.parentElement?.outerHTML.slice(0, 120),
      };
    });
    console.log(`\n=== ${label} (open) ===`);
    console.log(JSON.stringify(info, null, 2));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    const exit = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="sheet-content"]');
      if (!el) return { gone: true };
      const cs = getComputedStyle(el);
      return {
        stillMounted: true,
        dataState: el.getAttribute("data-state"),
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
      };
    });
    console.log(`=== ${label} (right after close) ===`);
    console.log(JSON.stringify(exit, null, 2));
    await page.waitForTimeout(600);
  };

  // sections page: open the "New sections" drawer
  await page.goto(`${BASE}/admin/academics/schedule/sections`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const sectionBtn = page.locator('button:has-text("Add section")').first();
  console.log("sections add button count:", await page.locator('button:has-text("Add section")').count());
  await probe("sections drawer", async () => {
    await page.locator('button:has-text("Add section")').first().click();
  });

  // subjects page: open a subject edit drawer
  await page.goto(`${BASE}/admin/academics/schedule/subjects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  console.log("subject rows:", await page.locator("table tbody tr").count());
  await probe("subjects edit drawer", async () => {
    const editBtn = page.locator('table tbody tr').first().locator('button[aria-label*="Edit"], button:has-text("Edit")').first();
    const n = await editBtn.count();
    console.log("edit buttons in first row:", n);
    if (n > 0) await editBtn.click();
    else await page.locator('table tbody tr').first().click();
  });

  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
