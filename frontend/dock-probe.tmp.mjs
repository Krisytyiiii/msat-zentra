import { chromium } from "playwright";

const accounts = [
  { email: "admin@zentra.test", password: "Admin2025!", role: "staff", path: "/admin/overview", label: "Admin" },
  { email: "principal@zentra.test", password: "Zentra2025!", role: "staff", path: "/principal/overview", label: "Principal" },
  { email: "registrar@zentra.test", password: "Zentra2025!", role: "staff", path: "/registrar/overview", label: "Registrar" },
  { email: "record_keeper@zentra.test", password: "Zentra2025!", role: "staff", path: "/record-keeper/overview", label: "Record keeper" },
  { email: "nurse@zentra.test", password: "Zentra2025!", role: "staff", path: "/nurse/overview", label: "Nurse" },
  { email: "guidance_counselor@zentra.test", password: "Zentra2025!", role: "staff", path: "/guidance/overview", label: "Guidance" },
  { email: "adm_coordinator@zentra.test", password: "Zentra2025!", role: "staff", path: "/coordinator/overview", label: "Coordinator" },
  { email: "adviser@zentra.test", password: "Zentra2025!", role: "staff", path: "/teacher/overview", label: "Teacher" },
];

const browser = await chromium.launch();
for (const width of [1600, 1280, 1024]) {
  for (const account of accounts) {
    const login = await fetch("http://localhost:4000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password, role: account.role }),
    });
    const payload = await login.json();
    if (!payload.accessToken) {
      console.log(width, account.label, "LOGIN FAILED", JSON.stringify(payload).slice(0, 120));
      continue;
    }
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    await page.addInitScript((t) => {
      window.localStorage.setItem("zentra.access", t);
    }, payload.accessToken);
    await page.goto(`http://localhost:3000${account.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const data = await page.evaluate(() => {
      const nav = document.querySelector("nav[class*='dock']");
      if (!nav) return { found: false };
      const label = nav.querySelector("a span[class*='label']");
      const anchors = [...nav.querySelectorAll("a")];
      const noLabel = anchors.filter((a) => !a.querySelector("span[class*='label']")).map((a) => a.getAttribute("aria-label"));
      const navRect = nav.getBoundingClientRect();
      return {
        found: true,
        dockAttr: document.documentElement.dataset.dock,
        navW: Math.round(navRect.width),
        navRight: Math.round(navRect.right),
        labels: anchors.length,
        missingLabels: noLabel,
        firstLabel: label?.textContent ?? null,
        firstLabelW: label ? Math.round(label.getBoundingClientRect().width) : null,
        href: location.pathname,
      };
    });
    console.log(width, account.label.padEnd(13), JSON.stringify(data));
    await page.close();
  }
}
await browser.close();
