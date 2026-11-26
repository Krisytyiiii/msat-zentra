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
for (const [name, url] of [["referrals","http://localhost:3000/coordinator/referrals"],["overview","http://localhost:3000/coordinator/overview"],["case-test","http://localhost:3000/coordinator/referrals/ee890e54-9c67-4cd3-be24-73be27ebbcb7"]]) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `tmp-${name}.png`, fullPage: true });
  const text = await page.locator("body").innerText();
  console.log(`===== ${name} =====`);
  console.log(text.slice(0, 2600));
}
await browser.close();
