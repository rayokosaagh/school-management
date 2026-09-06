// Visual regression preview using synthetic records only. No database or login.
// Run: node scripts/overview-preview.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "artifacts", "overview-preview");
const require = createRequire(import.meta.url);
globalThis.React = React;

async function playwright() {
  try { return require("playwright-core"); } catch {
    const cache = path.join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
    for (const dir of await fs.readdir(cache)) {
      try { return require(path.join(cache, dir, "node_modules", "playwright-core")); } catch { /* Next cached package. */ }
    }
    throw new Error("No local playwright-core available.");
  }
}

// Reuse the application's built fonts so text wrapping matches the real page.
async function previewFonts() {
  const chunks = path.join(root, ".next", "static", "chunks");
  let result = "";
  for (const file of await fs.readdir(chunks)) {
    if (!file.endsWith(".css")) continue;
    const css = await fs.readFile(path.join(chunks, file), "utf8");
    let faces = (css.match(/@font-face\{[^}]+\}/g) ?? []).join("\n");
    for (const match of [...faces.matchAll(/url\(([^)]+)\)/g)]) {
      const fontPath = path.resolve(chunks, match[1].replace(/["']/g, ""));
      const data = await fs.readFile(fontPath);
      faces = faces.replace(match[0], `url(data:font/woff2;base64,${data.toString("base64")})`);
    }
    result += faces;
  }
  return result + ':root{--font-display-face:"Bricolage Grotesque";--font-body-face:"Geist";--font-mono-face:"Geist Mono";--font-devanagari-face:"Noto Sans Devanagari"}';
}

function fixture(role) {
  const teacher = role === "TEACHER";
  const date = new Date("2026-09-06T00:00:00Z");
  const sections = Array.from({ length: teacher ? 4 : 8 }, (_, i) => ({
    id: i + 1, label: `Class ${i + 3} A`, students: 24 + i * 2,
    isClassTeacher: teacher && i === 0, attendanceTaken: i < 2,
  }));
  return {
    actor: { userId: 1, username: teacher ? "Maya" : role === "OFFICE" ? "Ravi" : "Sita", role, staffId: teacher ? 4 : null },
    yearLabel: "2083",
    overview: {
      scope: teacher ? "teacher" : "school", schoolDay: true,
      access: { records: true, attendance: true, registry: !teacher, marks: true, manageExams: !teacher, fees: !teacher, settings: role === "ADMIN", timetable: true },
      counts: { students: sections.reduce((n, s) => n + s.students, 0), staffTotal: teacher ? 0 : 24, staffActive: teacher ? 0 : 22, grades: teacher ? 4 : 8, sections: sections.length, subjects: teacher ? 0 : 12, offerings: teacher ? 0 : 40, assignments: teacher ? 6 : 86 },
      sections,
      today: { date, missingAttendance: sections.filter(s => !s.attendanceTaken).map(({ id, label }) => ({ id, label })), sectionsTotal: sections.length, absent: 3 },
      gaps: { sectionsWithoutClassTeacher: teacher ? [] : [{ id: 8, label: "Class 10 A" }], unassignedSlots: teacher ? 0 : 3, unpublishedExams: teacher ? 0 : 1, examsTotal: teacher ? 0 : 3, unbilledMonths: 0 },
      personal: { attendanceTaken: teacher ? 2 : 0, conductRecorded: 3, activitiesRecorded: 1 },
      trend: Array.from({ length: 14 }, (_, i) => ({ date: new Date(date.getTime() - (13 - i) * 86400000), present: i === 6 ? 0 : 35 + i, marked: i === 6 ? 0 : 50 })),
    },
    periods: teacher ? [
      { id: 1, periodName: "Period 1", startMinute: 600, endMinute: 645, subject: "Mathematics", classSection: "Class 3 A", room: "Room 12", isCurrent: true },
      { id: 2, periodName: "Period 3", startMinute: 705, endMinute: 750, subject: "Mathematics", classSection: "Class 5 A", room: "Room 8", isCurrent: false },
      { id: 3, periodName: "Period 5", startMinute: 825, endMinute: 870, subject: "Science", classSection: "Class 6 A", room: "Science lab", isCurrent: false },
    ] : [],
  };
}

await fs.mkdir(out, { recursive: true });
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, resolve: { alias: { "@": path.join(root, "src") } }, css: { postcss: { plugins: [] } } });
let browser;
try {
  const { OverviewWorkspace } = await vite.ssrLoadModule("/src/app/dashboard/_components/overview-workspace.tsx");
  const cssPath = path.join(root, "src/app/globals.css");
  const { css } = await postcss([tailwind()]).process(await fs.readFile(cssPath, "utf8"), { from: cssPath });
  const fonts = await previewFonts();
  const pw = await playwright();
  browser = await pw.chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  const results = [];
  for (const role of ["ADMIN", "OFFICE", "TEACHER"]) {
    const content = renderToStaticMarkup(React.createElement(OverviewWorkspace, fixture(role)));
    for (const theme of ["light", "dark"]) {
      const html = `<!doctype html><html lang="en" class="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${role} overview — synthetic preview</title><style>${fonts}${css}</style></head><body style="display:block"><main class="p-4 sm:p-6" style="max-width:1600px;margin:auto">${content}</main></body></html>`;
      const filename = `${role.toLowerCase()}-${theme}`;
      await fs.writeFile(path.join(out, `${filename}.html`), html);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(out, `${filename}-${width}.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        const invisibleLinks = await page.locator("a").evaluateAll(links => links.filter(a => !a.getBoundingClientRect().width).length);
        await page.getByText("Daily attendance details", { exact: true }).click();
        const detailsOpened = await page.locator("details").getAttribute("open") !== null;
        results.push({ role, theme, width, overflow, invisibleLinks, detailsOpened });
      }
    }
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some(r => r.overflow || r.invisibleLinks || !r.detailsOpened)) process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
}
