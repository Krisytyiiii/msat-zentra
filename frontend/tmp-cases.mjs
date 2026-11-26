import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/login/staff", { waitUntil: "networkidle" });
await page.fill("#email", "adm_coordinator@zentra.test");
await page.fill("#password", "Zentra2025!");
await page.click('button[type="submit"]');
await page.waitForURL(/coordinator/, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
const cases = [
  ["caseA-estsdfsd-2c5c", "2c5c399b-0165-40b3-b29a-269501623317"],
  ["caseB-test-ee89", "ee890e54-9c67-4cd3-be24-73be27ebbcb7"],
];
for (const [name, id] of cases) {
  await page.goto(`http://localhost:3000/coordinator/referrals/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `tmp-${name}.png`, fullPage: true });
  const text = await page.locator("body").innerText();
  console.log(`===== ${name} =====`);
  console.log(text.slice(0, 1800));
}
await browser.close();
