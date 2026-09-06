/*
 * Logs in and screenshots every dashboard route at three widths in both
 * themes, so a redesign step can be eyeballed in one pass.
 *
 *   SMOKE_USER=... SMOKE_PASS=... node scripts/ui-smoke.cjs
 *
 * Needs `next dev` on :3000 and Microsoft Edge (or set SMOKE_CHANNEL=chrome).
 * Uses playwright-core from the npx cache if it is not installed locally.
 */
const fs = require("node:fs");
const path = require("node:path");

function loadPlaywright() {
  try {
    return require("playwright-core");
  } catch {
    const cache = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
    for (const dir of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
      const candidate = path.join(cache, dir, "node_modules", "playwright-core");
      if (fs.existsSync(candidate)) return require(candidate);
    }
    throw new Error("playwright-core not found; run: npm i -D playwright-core");
  }
}

const ROUTES = [
  "dashboard",
  "dashboard/students",
  // Fixed ids: these prove the unknown-id redirect, not the pane. Phase 2b
  // selects the first row instead.
  "dashboard/students?student=1",
  // Honours as a view inside Students, and the old page redirecting to it.
  "dashboard/students?view=honours",
  "dashboard/honours",
  "dashboard/teachers",
  "dashboard/teachers?staff=1",
  "dashboard/classes",
  // Timetable as a view inside Classes, and the old page redirecting to it.
  "dashboard/classes?view=timetable",
  "dashboard/timetable",
  "dashboard/subjects",
  "dashboard/assignments",
  "dashboard/rollover",
  "dashboard/attendance",
  "dashboard/exams",
  "dashboard/fees",
  "dashboard/settings",
];
const WIDTHS = [1440, 1000, 390];
const OUT = path.join(__dirname, "..", "artifacts", "smoke");

(async () => {
  const user = process.env.SMOKE_USER, pass = process.env.SMOKE_PASS;
  if (!user || !pass) throw new Error("Set SMOKE_USER and SMOKE_PASS");
  fs.mkdirSync(OUT, { recursive: true });

  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ channel: process.env.SMOKE_CHANNEL || "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.getByLabel(/username/i).fill(user);
  await page.getByLabel(/^password/i).fill(pass);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(`http://localhost:3000/${route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        const name = `${route.replace(/\//g, "_").replace(/[?=]/g, "-")}-${width}-${theme}.png`;
        await page.screenshot({ path: path.join(OUT, name), fullPage: width !== 390 });
        console.log("shot", name);
      }
    }
  }
  await browser.close();
})().catch((e) => {
  console.error("SMOKE FAILED:", e.message);
  process.exit(1);
});
