import { chromium } from "playwright";

async function login(email, password, role) {
  const res = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  return (await res.json()).accessToken;
}

const browser = await chromium.launch();

// Admin desk
const adminToken = await login("admin@zentra.test", "Admin2025!", "admin");
const admin = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await admin.addInitScript((t) => window.localStorage.setItem("zentra.access", t), adminToken);
await admin.goto("http://localhost:3000/admin/overview", { waitUntil: "domcontentloaded" });
await admin.waitForTimeout(4500);
console.log("admin", JSON.stringify(await admin.evaluate(() => {
  const nav = document.querySelector("nav[class*='dock']");
  const label = nav?.querySelector("a span[class*='label']");
  return { dock: document.documentElement.dataset.dock, navW: nav && Math.round(nav.getBoundingClientRect().width), labels: nav ? nav.querySelectorAll("a span[class*='label']").length : 0, first: label?.textContent ?? null };
})));
await admin.screenshot({ path: "dock-admin.png" });
await admin.close();

// Teacher desk after choosing term
const teacherToken = await login("adviser@zentra.test", "Zentra2025!", "staff");
const teacher = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await teacher.addInitScript((t) => window.localStorage.setItem("zentra.access", t), teacherToken);
await teacher.goto("http://localhost:3000/teacher/overview", { waitUntil: "domcontentloaded" });
await teacher.waitForTimeout(2500);
const cont = teacher.getByRole("button", { name: /continue to workspace/i });
if (await cont.count()) await cont.click();
await teacher.waitForTimeout(4000);
console.log("teacher", JSON.stringify(await teacher.evaluate(() => {
  const nav = document.querySelector("nav[class*='dock']");
  const label = nav?.querySelector("a span[class*='label']");
  return { url: location.pathname, dock: document.documentElement.dataset.dock, navW: nav && Math.round(nav.getBoundingClientRect().width), first: label?.textContent ?? null };
})));
await teacher.screenshot({ path: "dock-teacher.png" });
await teacher.close();
await browser.close();
