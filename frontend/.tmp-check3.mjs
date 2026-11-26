import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:3000/login/admin", { waitUntil: "networkidle" });
await page.locator('input[type="email"], input[name="email"]').first().fill("admin@zentra.test");
await page.locator('input[type="password"]').first().fill("Admin2025!");
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(3000);

await page.goto("http://localhost:3000/admin/users?status=active&page=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
console.log("users reset:", await page.getByRole("button", { name: "Reset" }).count());
console.log("users search field:", await page.locator('[data-slot="search-field"]').count());
console.log("users mascots:", await page.locator('[aria-label$="profile mascot"]').count());
await page.screenshot({ path: ".tmp-users3.png" });

await page.goto("http://localhost:3000/admin/users/pending", { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
console.log("pending title present:", await page.getByText("Pending approvals").count());
console.log("pending tags:", await page.locator('[role="tablist"] [role="tab"]').allTextContents());
console.log("pending search field:", await page.locator('[data-slot="search-field"]').count());
console.log("pending headers:", await page.locator("table thead th").allTextContents());
console.log("pending mascots:", await page.locator('[aria-label$="profile mascot"]').count());
await page.screenshot({ path: ".tmp-pending.png" });
await browser.close();
