import { chromium } from "playwright";

const login = await fetch("http://localhost:4000/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "adviser@zentra.test", password: "Zentra2025!", role: "staff" }),
});
const { accessToken } = await login.json();
if (!accessToken) throw new Error("login failed");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript((token) => {
  window.localStorage.setItem("zentra.access", token);
}, accessToken);
await page.goto("http://localhost:3000/teacher/advisory/list", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const pick = page.getByText("Select this term").first();
if (await pick.count()) {
  await pick.click();
  await page.waitForTimeout(2500);
}
await page.waitForTimeout(2500);

const rects = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label="LRN"], [aria-label="Risk level"]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { text: el.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
  }),
);
console.log(JSON.stringify(rects.slice(0, 8), null, 2));
await page.screenshot({ path: "tmp-advisory.png", clip: { x: 0, y: 90, width: 420, height: 500 } });
await browser.close();
