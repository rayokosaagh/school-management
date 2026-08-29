# Option C redesign — Phase 1: foundation, shell, primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the indigo token system, new fonts, theme switching, the top-bar + icon-rail shell (with mobile bottom bar and account menu), and the shared page primitives (`PageFrame`, `RegisterTabs`, `DataTable`, `DetailPane`, `EmptyState`, `StatusDot`, `Kpi`, `AttendanceStrip`) in place — while every existing page keeps working unchanged.

**Architecture:** Tokens are re-pointed underneath the existing shadcn variable names so current components restyle without edits. The old sidebar is replaced by `TopBar` + `IconRail` inside a CSS-grid layout. New primitives are added alongside the old ones; nothing old is deleted in this phase (that is Phase 3), so each task leaves `tsc`, `vitest`, and `next build` green.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, Tailwind 4 (`@theme inline`), shadcn base-nova on `@base-ui/react`, `@tanstack/react-table` 9, `motion/react`, `lucide-react`, Vitest 4, Playwright (via Edge) for smoke screenshots.

**Spec:** `docs/superpowers/specs/2026-08-29-option-c-redesign-design.md` — this plan implements spec §3 (foundation), §4 (shell), §5 (responsive), §7.1–7.2 (primitives), §11 smoke script, and spec §12 steps 1–3.

## Global Constraints

- Project root: `D:\Project\Web-Project\SchoolMgmnt\school-management` (POSIX: `/d/Project/Web-Project/SchoolMgmnt/school-management`). All commands run there.
- Existing tests must stay green: `npx vitest run` (unit) and `DB_TESTS=1 npx vitest run` (full, needs the local Postgres). Never skip or delete an existing test.
- After every task: `npx tsc --noEmit -p tsconfig.json`, `npx eslint .`, `npx vitest run` all pass. `npx next build` passes at the end of Tasks 1, 5, 9, 12.
- No Prisma schema changes. No server-action signature changes.
- Colours only through tokens. No `emerald-*`, `amber-*`, `red-*`, `zinc-*`, `gray-*`, hex, or `oklch()` literals in any file this plan creates.
- Status is never colour-only: dot/icon + word.
- Every icon-only button has `aria-label`. Every animation is gated on `useReducedMotion()` from `motion/react`.
- Breakpoints: `shell` = 54rem (864px, spec "860px"), `split` = 74rem (1184px, spec "1180px"). Use these Tailwind variants, never `md:`/`lg:` for shell decisions.
- Shell dimensions: rail 64px, top bar 56px, table row 38px (comfortable) / 32px (compact).
- Fonts: Bricolage Grotesque (display), Geist (body), Geist Mono (numbers), Noto Sans Devanagari (fallback). Loaded with `next/font/google` only.
- The dev server (`next dev`) may be running on :3000 from another terminal; do not start a second one. `next build` while dev runs is fine (Next 16 uses `.next/dev` for dev).
- Commit after every task. Commit messages are Conventional Commits and end with `Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz`.

---

## File map

| File | Responsibility |
|---|---|
| `src/app/globals.css` | token scale (light + dark), shadcn variable re-pointing, Tailwind theme registration, breakpoints, print styles (kept) |
| `src/app/layout.tsx` | fonts, no-flash theme script, ToastProvider |
| `src/lib/theme/theme.ts` | pure theme preference resolution + the no-flash script string |
| `src/lib/theme/theme.test.ts` | unit tests for the above |
| `src/components/ui/theme-toggle.tsx` | sun/moon button; applies `.dark` on `<html>`, persists |
| `src/components/ui/brand-mark.tsx` | initial-letter mark used in top bar and auth pages |
| `src/app/dashboard/_components/nav-model.ts` | nav ids/labels/hrefs/icons, `activeId()`, mobile subset — shared by rail, account menu, (Phase 3) global search |
| `src/app/dashboard/_components/icon-rail.tsx` | 64px rail ≥ `shell`, 5-item bottom bar below |
| `src/app/dashboard/_components/account-menu.tsx` | avatar dropdown: identity, hidden-on-mobile nav, Settings, theme, sign out |
| `src/app/dashboard/_components/alerts-popover.tsx` | bell + dot + popover of due items |
| `src/lib/dashboard/alerts.ts` (+ `.test.ts`) | pure `dueItems(overview)` → list of `{ label, href }` |
| `src/app/dashboard/_components/top-bar.tsx` | server component composing brand, year pill, alerts, theme, account |
| `src/app/dashboard/layout.tsx` | grid shell |
| `src/app/dashboard/template.tsx` | 120ms route fade |
| `src/app/page.tsx` | redirect to `/dashboard` or `/login` |
| `src/components/ui/page-frame.tsx` | page contract (§6): header, tabs, toolbar, body, aside with Sheet fallback |
| `src/components/ui/register-tabs.tsx` | horizontal tab strip |
| `src/components/ui/empty-state.tsx` | icon + sentence + one action |
| `src/components/ui/status-dot.tsx` | dot + word |
| `src/components/ui/kpi.tsx` | number + label |
| `src/components/ui/attendance-strip.tsx` | N-day strip + % |
| `src/lib/table/prefs.ts` (+ `.test.ts`) | table preference persistence (density, page size, hidden columns) |
| `src/components/ui/data-table.tsx` | TanStack wrapper |
| `src/components/ui/detail-pane.tsx` | aside shell, inline ≥ `split`, Sheet below |
| `scripts/ui-smoke.cjs` | Playwright screenshot run |
| `eslint.config.mjs` | ignore `scripts/**` for `no-require-imports` |

---

### Task 0: Baseline commit

The repository has one scaffold commit; the whole app is untracked. A baseline makes every later step diffable and revertible.

**Files:**
- Modify: `.gitignore` (add `/artifacts/smoke/`)

- [ ] **Step 1: Confirm nothing sensitive is about to be committed**

Run: `git status --porcelain | grep -v '^??' ; git check-ignore -q .env && echo ".env ignored"; git check-ignore -q src/generated/prisma/client.ts && echo "generated ignored"`
Expected: both "ignored" lines print.

- [ ] **Step 2: Ignore smoke screenshots**

Append to `.gitignore`:

```
/artifacts/smoke/
```

- [ ] **Step 3: Commit the current app as the baseline**

```bash
git add -A
git commit -m "chore: baseline of school-management before Option C redesign

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

Expected: one commit containing `src/`, `prisma/`, `scripts/`, `docs/`, `artifacts/option-c-mockup.html` and the mock PNGs; no `.env`, no `src/generated/`.

---

### Task 1: Tokens, fonts, breakpoints

**Files:**
- Modify: `src/app/globals.css` (replace everything above the `/* Printed marksheets */` comment; keep the `.sheet*` and `@media print` blocks verbatim)
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces Tailwind utilities used by every later task: `bg-page`, `bg-surface`, `bg-surface-2`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-2`, `text-ink-3`, `bg-brand`, `bg-brand-deep`, `bg-brand-tint`, `bg-brand-tint-2`, `text-brand-text`, `text-brand-ink`, `bg-ok`/`text-ok`/`bg-ok-tint`, same for `warn` and `bad`; `font-display`, `font-body`, `font-mono`; variants `shell:` and `split:`; CSS vars `--rail`, `--topbar`, `--row`, `--row-compact`.
- Keeps every existing shadcn utility (`bg-primary`, `text-muted-foreground`, …) and the legacy `--tint-*`, `--action`, `--surface-ring`, `--surface-shadow`, `--rail` colour, `card-surface` working, re-pointed at the new scale.

- [ ] **Step 1: Replace the top of `globals.css`**

Replace from line 1 down to (not including) the line `/* ---------------------------------------------------------------------------` that precedes `Printed marksheets` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

/* ---------------------------------------------------------------------------
   Token scale. One indigo for every action, a cool neutral ramp, three status
   tones. The shadcn variable names further down are aliases onto this scale so
   the generated primitives restyle without edits.
   --------------------------------------------------------------------------- */
:root {
  --brand: oklch(0.45 0.21 276);
  --brand-deep: oklch(0.34 0.16 278);
  --brand-tint: oklch(0.96 0.02 276);
  --brand-tint-2: oklch(0.92 0.04 276);
  --brand-text: oklch(0.40 0.18 277);
  --brand-ink: oklch(0.99 0 0);

  --page: oklch(0.975 0.005 270);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.985 0.004 270);
  --line: oklch(0.92 0.008 270);
  --line-strong: oklch(0.85 0.012 270);

  --ink: oklch(0.17 0.02 275);
  --ink-2: oklch(0.36 0.02 275);
  --ink-3: oklch(0.55 0.02 275);

  --ok: oklch(0.52 0.12 165);
  --ok-tint: oklch(0.96 0.03 165);
  --warn: oklch(0.55 0.13 65);
  --warn-tint: oklch(0.96 0.04 80);
  --bad: oklch(0.52 0.20 15);
  --bad-tint: oklch(0.95 0.03 15);

  --shadow-panel: 0 1px 2px oklch(0.17 0.02 275 / 6%), 0 8px 24px -12px oklch(0.17 0.02 275 / 18%);

  --rail: 64px;
  --topbar: 56px;
  --row: 38px;
  --row-compact: 32px;
  --radius: 0.5rem;
}

.dark {
  --brand: oklch(0.62 0.19 276);
  --brand-deep: oklch(0.32 0.12 278);
  --brand-tint: oklch(0.25 0.05 276);
  --brand-tint-2: oklch(0.30 0.07 276);
  --brand-text: oklch(0.82 0.09 276);
  --brand-ink: oklch(0.99 0 0);

  --page: oklch(0.15 0.012 275);
  --surface: oklch(0.19 0.014 275);
  --surface-2: oklch(0.22 0.015 275);
  --line: oklch(0.28 0.015 275);
  --line-strong: oklch(0.36 0.018 275);

  --ink: oklch(0.95 0.008 275);
  --ink-2: oklch(0.82 0.012 275);
  --ink-3: oklch(0.64 0.015 275);

  --ok: oklch(0.80 0.14 165);
  --ok-tint: oklch(0.26 0.04 165);
  --warn: oklch(0.85 0.14 85);
  --warn-tint: oklch(0.28 0.05 80);
  --bad: oklch(0.74 0.16 15);
  --bad-tint: oklch(0.28 0.06 15);

  --shadow-panel: 0 1px 2px oklch(0 0 0 / 40%), 0 12px 32px -12px oklch(0 0 0 / 60%);
}

/* shadcn aliases --------------------------------------------------------- */
:root, .dark {
  --background: var(--page);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface);
  --popover-foreground: var(--ink);
  --primary: var(--brand);
  --primary-foreground: var(--brand-ink);
  --secondary: var(--surface-2);
  --secondary-foreground: var(--ink);
  --muted: var(--surface-2);
  --muted-foreground: var(--ink-3);
  --accent: var(--brand-tint);
  --accent-foreground: var(--brand-text);
  --destructive: var(--bad);
  --border: var(--line);
  --input: var(--line);
  --ring: var(--brand);
  --chart-1: var(--brand);
  --chart-2: var(--ok);
  --chart-3: var(--warn);
  --chart-4: var(--bad);
  --chart-5: var(--ink-3);
  --sidebar: var(--surface);
  --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--brand);
  --sidebar-primary-foreground: var(--brand-ink);
  --sidebar-accent: var(--brand-tint);
  --sidebar-accent-foreground: var(--brand-text);
  --sidebar-border: var(--line);
  --sidebar-ring: var(--brand);

  /* Legacy names still used by pages until Phase 2/3 migrate them. */
  --surface-ring: var(--line);
  --surface-shadow: var(--shadow-panel);
  --action: var(--brand);
  --action-foreground: var(--brand-ink);
  --tint-violet: var(--brand-tint);
  --tint-violet-fg: var(--brand-text);
  --tint-blue: var(--brand-tint);
  --tint-blue-fg: var(--brand-text);
  --tint-green: var(--ok-tint);
  --tint-green-fg: var(--ok);
  --tint-amber: var(--warn-tint);
  --tint-amber-fg: var(--warn);
  --tint-rose: var(--bad-tint);
  --tint-rose-fg: var(--bad);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-brand: var(--brand);
  --color-brand-deep: var(--brand-deep);
  --color-brand-tint: var(--brand-tint);
  --color-brand-tint-2: var(--brand-tint-2);
  --color-brand-text: var(--brand-text);
  --color-brand-ink: var(--brand-ink);
  --color-page: var(--page);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-ok: var(--ok);
  --color-ok-tint: var(--ok-tint);
  --color-warn: var(--warn);
  --color-warn-tint: var(--warn-tint);
  --color-bad: var(--bad);
  --color-bad-tint: var(--bad-tint);

  /* legacy */
  --color-surface-ring: var(--surface-ring);
  --color-action: var(--action);
  --color-action-foreground: var(--action-foreground);
  --color-tint-violet: var(--tint-violet);
  --color-tint-violet-fg: var(--tint-violet-fg);
  --color-tint-blue: var(--tint-blue);
  --color-tint-blue-fg: var(--tint-blue-fg);
  --color-tint-green: var(--tint-green);
  --color-tint-green-fg: var(--tint-green-fg);
  --color-tint-amber: var(--tint-amber);
  --color-tint-amber-fg: var(--tint-amber-fg);
  --color-tint-rose: var(--tint-rose);
  --color-tint-rose-fg: var(--tint-rose-fg);
  --color-rail: var(--surface-2);

  --font-display: var(--font-display-face), var(--font-body-face), system-ui, sans-serif;
  --font-body: var(--font-body-face), var(--font-devanagari-face), system-ui, sans-serif;
  --font-sans: var(--font-body-face), var(--font-devanagari-face), system-ui, sans-serif;
  --font-mono: var(--font-mono-face), ui-monospace, monospace;
  --font-devanagari: var(--font-devanagari-face), sans-serif;

  --shadow-panel: var(--shadow-panel);

  --radius-sm: calc(var(--radius) * 0.75);
  --radius-md: var(--radius);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.25);
  --radius-2xl: calc(var(--radius) * 1.75);
  --radius-3xl: calc(var(--radius) * 2.25);
  --radius-4xl: calc(var(--radius) * 3);

  --breakpoint-shell: 54rem;
  --breakpoint-split: 74rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-body;
    color-scheme: light;
  }
  html.dark {
    color-scheme: dark;
  }
  body {
    @apply bg-background text-foreground text-[13.5px] leading-[1.45] antialiased;
    font-feature-settings: "ss01", "cv11";
  }
  /* Mobile-first: 22px, 26px from the shell breakpoint up. */
  h1 {
    @apply font-display text-[22px] leading-[1.1] font-semibold tracking-[-0.015em] shell:text-[26px] shell:tracking-[-0.02em];
  }
}

/* Kept for pages not yet migrated; removed in Phase 3. */
@utility card-surface {
  background: var(--surface);
  border-radius: calc(var(--radius) * 1.25);
  box-shadow: var(--shadow-panel);
  outline: 1px solid var(--line);
  outline-offset: -1px;
}

@media print {
  html.dark { color-scheme: light; }
  html.dark, html.dark * { --page: #fff; --surface: #fff; --ink: #000; --ink-2: #222; --ink-3: #444; --line: #bbb; }
}

```

- [ ] **Step 2: Load the new fonts in `src/app/layout.tsx`**

Replace the file with:

```tsx
import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist,
  Geist_Mono,
  Noto_Sans_Devanagari,
} from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { getLetterhead } from "@/lib/registry/school";

const display = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

const body = Geist({
  variable: "--font-body-face",
  subsets: ["latin"],
  display: "swap",
});

// Nepali names and BS dates appear throughout; without a Devanagari face they
// fall back to whatever the operating system happens to have installed.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari-face",
  subsets: ["devanagari"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
});

/// Read at request time so renaming the school in Settings shows in the browser
/// tab without a rebuild.
export async function generateMetadata(): Promise<Metadata> {
  const school = await getLetterhead();
  return {
    title: school.configured ? school.name : "School Management",
    description: "Students, staff, classes, subjects, attendance and exams.",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${devanagari.variable} ${mono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` is needed because Task 2 adds a script that sets `class="dark"` before hydration.

- [ ] **Step 3: Fix the two files that referenced the old font variables**

Run: `grep -rn "font-ui-\|font-heading" src --include=*.tsx --include=*.ts --include=*.css`
Expected: only `src/components/ui/card.tsx` (`font-heading`). Change that class to `font-display`. Any other hit: replace `font-ui-sans`→`font-body`, `font-ui-mono`→`font-mono`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint . && npx vitest run && npx next build 2>&1 | tail -5`
Expected: all pass; build prints `✓ Compiled successfully`. (ESLint still fails on `scripts/seed.cjs` until Task 12 — if that is the only error, continue.)

- [ ] **Step 5: Eyeball once**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login`
Expected: `200` if the dev server is running. Open `http://localhost:3000/login` in a browser: buttons are indigo, text is Geist, the heading is Bricolage. If the dev server is not running, skip.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/ui/card.tsx
git commit -m "feat(ui): indigo token scale, Geist/Bricolage fonts, shell breakpoints

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 2: Theme preference + toggle

**Files:**
- Create: `src/lib/theme/theme.ts`
- Create: `src/lib/theme/theme.test.ts`
- Create: `src/components/ui/theme-toggle.tsx`
- Modify: `src/app/layout.tsx` (inject the no-flash script)

**Interfaces:**
- Produces: `resolveTheme(stored: string | null, systemDark: boolean): "light" | "dark"`, `THEME_KEY = "theme"`, `NO_FLASH_SCRIPT: string`, `applyTheme(theme: "light" | "dark"): void` (browser only), `<ThemeToggle />` (client). Used by Task 5 (`TopBar`) and Task 6 (`AccountMenu`).

- [ ] **Step 1: Write the failing test**

`src/lib/theme/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NO_FLASH_SCRIPT, THEME_KEY, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("follows the stored preference when it is explicit", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system when nothing or 'system' is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("treats garbage as system", () => {
    expect(resolveTheme("blue", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("NO_FLASH_SCRIPT", () => {
  it("reads the same storage key and toggles the dark class", () => {
    expect(NO_FLASH_SCRIPT).toContain(`"${THEME_KEY}"`);
    expect(NO_FLASH_SCRIPT).toContain("classList.add(\"dark\")");
    expect(NO_FLASH_SCRIPT).toContain("prefers-color-scheme: dark");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/theme`
Expected: FAIL — cannot resolve `./theme`.

- [ ] **Step 3: Implement `src/lib/theme/theme.ts`**

```ts
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_KEY = "theme";

/// Explicit light/dark wins; anything else (missing, "system", garbage) follows
/// the operating system.
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return systemDark ? "dark" : "light";
}

/// Runs inline in <head> before paint so a dark-mode user never sees a white
/// flash. Must stay dependency-free and mirror resolveTheme exactly.
export const NO_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

/// Browser only. Sets the class the CSS keys off and remembers the choice.
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the class still applies for this page.
  }
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/theme`
Expected: 4 passed.

- [ ] **Step 5: Create `src/components/ui/theme-toggle.tsx`**

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";

/// Reads the class the no-flash script already set, so the icon matches the
/// page from the first client render.
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => setTheme(currentTheme()), []);

  const dark = theme === "dark";
  function toggle() {
    const next: Theme = dark ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "text-ink-2 hover:bg-page grid size-8 place-items-center rounded-lg transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
        className,
      )}
    >
      {dark ? <Moon className="size-4.5" aria-hidden="true" /> : <Sun className="size-4.5" aria-hidden="true" />}
    </button>
  );
}
```

- [ ] **Step 6: Inject the no-flash script**

In `src/app/layout.tsx` add `import { NO_FLASH_SCRIPT } from "@/lib/theme/theme";` and, as the first child of `<html>`:

```tsx
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/theme src/components/ui/theme-toggle.tsx src/app/layout.tsx
git commit -m "feat(ui): theme preference resolution, no-flash script and toggle

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 3: Install shadcn primitives + TanStack Table

**Files:**
- Create (by CLI): `src/components/ui/{dialog,sheet,dropdown-menu,popover,command,tooltip,table,tabs,skeleton,badge,scroll-area}.tsx`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces the shadcn exports later tasks import: `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger, SheetClose`; `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup`; `Popover, PopoverTrigger, PopoverContent`; `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`; `Table, TableHeader, TableBody, TableRow, TableHead, TableCell`; `Skeleton`; `Badge`; `ScrollArea`.
- Base-ui note: in the base-nova style, triggers compose with `render={<Button … />}` (base-ui) rather than Radix's `asChild`. Open the generated file and follow what it exports before using a trigger.

- [ ] **Step 1: Install**

Run: `npx shadcn@latest add dialog sheet dropdown-menu popover command tooltip table tabs skeleton badge scroll-area -y 2>&1 | tail -20`
Expected: "Checking registry… Installing dependencies… Created N files". If it asks to overwrite an existing file (`button`, `input`, `select`, `label`, `checkbox`, `separator`, `card`), answer **No** — those are already customised.

- [ ] **Step 2: Install TanStack Table**

Run: `npm install @tanstack/react-table@^9 2>&1 | tail -3`
Expected: added 1–2 packages.

- [ ] **Step 3: Confirm the generated trigger API**

Run: `grep -n "render\|asChild" src/components/ui/dropdown-menu.tsx src/components/ui/sheet.tsx src/components/ui/popover.tsx | head -20`
Record which prop the triggers use. Later tasks are written for `render=`; if the files use `asChild`, use that instead.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run && ls src/components/ui/`
Expected: pass; the 11 new files are listed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/ui
git commit -m "chore(ui): add shadcn dialog/sheet/dropdown/popover/command/tooltip/table/tabs/skeleton/badge/scroll-area and TanStack Table

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 4: Nav model, brand mark, icon rail

**Files:**
- Create: `src/app/dashboard/_components/nav-model.ts`
- Create: `src/app/dashboard/_components/nav-model.test.ts`
- Create: `src/components/ui/brand-mark.tsx`
- Create: `src/app/dashboard/_components/icon-rail.tsx`

**Interfaces:**
- Produces: `NAV_GROUPS: NavGroup[]`, `SETTINGS: NavItem`, `MOBILE_IDS: string[]`, `activeId(pathname: string): string`, `visibleGroups(allowed: string[]): NavGroup[]`, types `NavItem = { id; label; href; icon: LucideIcon }`, `NavGroup = { id; items: NavItem[] }`; `<BrandMark name size />`; `<IconRail allowed />`.
- Consumed by Task 5 (`layout.tsx`), Task 6 (`AccountMenu` lists the ids not in `MOBILE_IDS`), Phase 3 global search.

- [ ] **Step 1: Write the failing test** — `src/app/dashboard/_components/nav-model.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { MOBILE_IDS, NAV_GROUPS, SETTINGS, activeId, visibleGroups } from "./nav-model";

describe("activeId", () => {
  it("picks the longest matching prefix", () => {
    expect(activeId("/dashboard")).toBe("home");
    expect(activeId("/dashboard/students")).toBe("students");
    expect(activeId("/dashboard/students/12")).toBe("students");
    expect(activeId("/dashboard/exams/print")).toBe("exams");
    expect(activeId("/dashboard/settings")).toBe("settings");
  });
  it("returns '' off the dashboard", () => {
    expect(activeId("/login")).toBe("");
  });
});

describe("visibleGroups", () => {
  it("drops items and then empty groups the account may not open", () => {
    const groups = visibleGroups(["home", "attendance"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["home"], ["attendance"]]);
  });
  it("never includes settings; the rail pins it separately", () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain(SETTINGS.id);
  });
});

it("mobile bar has five items, all of which exist", () => {
  const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
  expect(MOBILE_IDS).toHaveLength(5);
  for (const id of MOBILE_IDS) expect(ids).toContain(id);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/dashboard/_components/nav-model`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `nav-model.ts`**

```ts
import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { id: string; label: string; href: string; icon: LucideIcon };
export type NavGroup = { id: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "people",
    items: [
      { id: "home", label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { id: "students", label: "Students", href: "/dashboard/students", icon: GraduationCap },
      { id: "teachers", label: "Staff", href: "/dashboard/teachers", icon: Users },
    ],
  },
  {
    id: "timetable",
    items: [
      { id: "classes", label: "Classes", href: "/dashboard/classes", icon: BookOpen },
      { id: "subjects", label: "Subjects", href: "/dashboard/subjects", icon: NotebookPen },
      { id: "assignments", label: "Teaching", href: "/dashboard/assignments", icon: ClipboardList },
    ],
  },
  {
    id: "daily",
    items: [
      { id: "attendance", label: "Roll call", href: "/dashboard/attendance", icon: CalendarCheck },
      { id: "exams", label: "Exams", href: "/dashboard/exams", icon: ClipboardCheck },
    ],
  },
];

export const SETTINGS: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/dashboard/settings",
  icon: Settings,
};

/// The bottom bar on phones. Everything else moves into the account menu.
export const MOBILE_IDS = ["home", "students", "teachers", "attendance", "exams"];

const ALL: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS];

/// Longest matching prefix wins, so /dashboard/students does not also light up
/// Overview at /dashboard.
export function activeId(pathname: string): string {
  return (
    ALL.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.id ?? ""
  );
}

/// Hiding a link is a courtesy; the pages enforce permissions themselves.
export function visibleGroups(allowed: string[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowed.includes(i.id)) }))
    .filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/dashboard/_components/nav-model`
Expected: 5 passed.

- [ ] **Step 5: Create `src/components/ui/brand-mark.tsx`**

```tsx
import { cn } from "@/lib/utils";

/// The school's initial on the brand gradient. Used in the top bar and on the
/// auth pages so the same mark greets people before and after sign-in.
export function BrandMark({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "S").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "from-brand to-brand-deep text-brand-ink font-display grid shrink-0 place-items-center bg-gradient-to-br font-bold tracking-tight",
        size === "md" ? "size-8 rounded-[9px] text-[15px]" : "size-14 rounded-2xl text-2xl",
        className,
      )}
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 6: Create `src/app/dashboard/_components/icon-rail.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_IDS, SETTINGS, activeId, visibleGroups, type NavItem } from "./nav-model";

function RailLink({ item, active, className }: { item: NavItem; active: boolean; className?: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-ink-3 hover:bg-page hover:text-ink flex h-13 flex-col items-center justify-center gap-1 rounded-[9px] text-[10.5px] font-medium tracking-[0.01em] no-underline transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
        active && "bg-brand-tint text-brand-text",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/// 64px icon rail from the `shell` breakpoint up; a five-item bottom bar below.
export function IconRail({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const current = activeId(pathname);
  const groups = visibleGroups(allowed);
  const mobile = groups
    .flatMap((g) => g.items)
    .filter((i) => MOBILE_IDS.includes(i.id));

  return (
    <>
      <nav
        aria-label="Main"
        className="bg-surface border-line shell:flex hidden w-[var(--rail)] flex-col border-r py-2"
      >
        {groups.map((group, i) => (
          <div
            key={group.id}
            className={cn("flex flex-col gap-0.5 px-2 py-1.5", i > 0 && "border-line mt-1 border-t pt-2.5")}
          >
            {group.items.map((item) => (
              <RailLink key={item.id} item={item} active={current === item.id} />
            ))}
          </div>
        ))}
        <div className="flex-1" />
        {allowed.includes(SETTINGS.id) ? (
          <div className="px-2 py-1.5">
            <RailLink item={SETTINGS} active={current === SETTINGS.id} />
          </div>
        ) : null}
      </nav>

      <nav
        aria-label="Main"
        className="bg-surface border-line shell:hidden fixed inset-x-0 bottom-0 z-20 flex border-t px-1 pt-1 pb-[max(4px,env(safe-area-inset-bottom))]"
      >
        {mobile.map((item) => (
          <RailLink key={item.id} item={item} active={current === item.id} className="flex-1" />
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/_components/nav-model.ts src/app/dashboard/_components/nav-model.test.ts src/components/ui/brand-mark.tsx src/app/dashboard/_components/icon-rail.tsx
git commit -m "feat(shell): nav model, brand mark and icon rail with mobile bottom bar

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 5: Account menu, top bar, grid layout, route fade

**Files:**
- Create: `src/app/dashboard/_components/account-menu.tsx`
- Create: `src/app/dashboard/_components/top-bar.tsx`
- Create: `src/app/dashboard/template.tsx`
- Modify: `src/app/dashboard/layout.tsx` (rewrite)
- Modify: `src/app/dashboard/_components/year-switcher.tsx` (only the trigger classes; see Step 4)
- Delete: `src/app/dashboard/_components/app-sidebar.tsx`, `src/app/dashboard/_components/dashboard-nav.tsx`

**Interfaces:**
- Consumes: `IconRail`, `BrandMark`, `ThemeToggle`, `visibleGroups`, `MOBILE_IDS`, `SETTINGS`, shadcn `DropdownMenu*`.
- Produces: `<TopBar school={{name, address}} today={string} years currentId span todayInYear username roleLabel allowed alerts={ReactNode} />` — `alerts` slot is filled by Task 6.

- [ ] **Step 1: Create `account-menu.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyTheme, currentTheme } from "@/lib/theme/theme";
import { MOBILE_IDS, SETTINGS, visibleGroups } from "./nav-model";

export function AccountMenu({
  username,
  roleLabel,
  allowed,
}: {
  username: string;
  roleLabel: string;
  allowed: string[];
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // Pages the bottom bar cannot show; the menu is where they live on a phone.
  const overflow = visibleGroups(allowed)
    .flatMap((g) => g.items)
    .filter((i) => !MOBILE_IDS.includes(i.id));

  async function logOut() {
    setSigningOut(true);
    // redirect: false keeps NextAuth from doing a hard document navigation, so
    // the client router stays in charge and the cache is cleared properly.
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  }

  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu: ${username}, ${roleLabel}`}
        className="bg-brand-tint-2 text-brand-text focus-visible:ring-ring/50 ml-1 grid size-[30px] place-items-center rounded-full text-xs font-semibold uppercase focus-visible:ring-3 focus-visible:outline-none"
      >
        {username.slice(0, 2)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium">{username}</span>
          <span className="text-ink-3 text-xs font-normal">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {overflow.length > 0 ? (
          <>
            <DropdownMenuGroup className="shell:hidden">
              {overflow.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.id} render={<Link href={item.href} />}>
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="shell:hidden" />
          </>
        ) : null}
        {allowed.includes(SETTINGS.id) ? (
          <DropdownMenuItem render={<Link href={SETTINGS.href} />}>
            <SETTINGS.icon className="size-4" aria-hidden="true" />
            Settings
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={toggleTheme}>
          <Sun className="size-4 dark:hidden" aria-hidden="true" />
          <Moon className="hidden size-4 dark:block" aria-hidden="true" />
          Switch theme
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logOut} disabled={signingOut}>
          <LogOut className="size-4" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

If Task 3 Step 3 showed the generated `DropdownMenuItem` composes with `asChild` instead of `render`, write `<DropdownMenuItem asChild><Link href=…>…</Link></DropdownMenuItem>`.

- [ ] **Step 2: Create `top-bar.tsx`** (server component; `YearSwitcher`, `ThemeToggle`, `AccountMenu` are client)

```tsx
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccountMenu } from "./account-menu";
import { YearSwitcher } from "./year-switcher";

export function TopBar({
  school,
  today,
  years,
  currentId,
  span,
  todayInYear,
  username,
  roleLabel,
  allowed,
  alerts,
}: {
  school: { name: string; address: string | null };
  today: string;
  years: { id: number; nameBS: string; sections: number }[];
  currentId: number | null;
  span: string | null;
  todayInYear: boolean;
  username: string;
  roleLabel: string;
  allowed: string[];
  /// The alerts button, rendered by the layout because it needs the overview.
  alerts?: ReactNode;
}) {
  return (
    <header className="bg-surface border-line no-print col-span-full flex h-[var(--topbar)] items-center gap-3 border-b px-3 shell:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandMark name={school.name} />
        <div className="shell:block hidden min-w-0">
          <p className="font-display truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">
            {school.name}
          </p>
          <p className="text-ink-3 truncate text-[11.5px] leading-tight">
            {[school.address, today].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {/* Centre slot: the global search trigger lands here in Phase 3. */}
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <YearSwitcher years={years} currentId={currentId} span={span} todayInYear={todayInYear} />
        {alerts}
        <ThemeToggle />
        <AccountMenu username={username} roleLabel={roleLabel} allowed={allowed} />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Rewrite `src/app/dashboard/layout.tsx`**

```tsx
import { auth } from "@/lib/auth/auth";
import { formatBs } from "@/lib/date/bs";
import {
  getCurrentAcademicYear,
  listAcademicYearsWithSize,
} from "@/lib/registry/academic-year";
import { getLetterhead } from "@/lib/registry/school";
import { currentActor } from "@/lib/auth/guard";
import { loadGrants, granted } from "@/lib/auth/permissions";
import { ROLE_LABEL, capabilityFor } from "@/lib/auth/roles";
import { IconRail } from "./_components/icon-rail";
import { TopBar } from "./_components/top-bar";
import { NAV_GROUPS, SETTINGS } from "./_components/nav-model";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, years, currentYear, school] = await Promise.all([
    auth(),
    listAcademicYearsWithSize(),
    getCurrentAcademicYear(),
    getLetterhead(),
  ]);
  const username = session?.user?.username || "Account";

  // Worked out against the stored matrix rather than the token, so a permission
  // change shows in the navigation without waiting for a fresh sign-in.
  const [actor, grants] = await Promise.all([currentActor(), loadGrants()]);
  const allowed = actor
    ? [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS]
        .filter((item) => {
          const capability = capabilityFor(item.href);
          return capability === null || granted(grants, actor.role, capability);
        })
        .map((item) => item.id)
    : [];

  const now = new Date();

  return (
    <div className="bg-page grid h-screen grid-cols-1 grid-rows-[var(--topbar)_1fr] shell:grid-cols-[var(--rail)_1fr]">
      <TopBar
        school={{ name: school.name, address: school.address ?? null }}
        today={formatBs(now, "YYYY MMMM DD, dddd")}
        years={years}
        currentId={currentYear?.id ?? null}
        span={
          currentYear
            ? `${formatBs(currentYear.startsOn, "YYYY-MM-DD")} → ${formatBs(currentYear.endsOn, "YYYY-MM-DD")}`
            : null
        }
        todayInYear={currentYear ? now >= currentYear.startsOn && now <= currentYear.endsOn : false}
        username={username}
        roleLabel={actor ? ROLE_LABEL[actor.role] : "Signed in"}
        allowed={allowed}
      />
      <IconRail allowed={allowed} />
      {/* relative: form controls render absolutely-positioned hidden inputs, which
          would otherwise be contained by the body and stretch the document.
          Bottom padding keeps content clear of the mobile bar. */}
      <main className="relative min-h-0 overflow-y-auto p-4 pb-20 shell:p-6 shell:pb-6">
        {children}
      </main>
    </div>
  );
}
```

Check `getLetterhead()`'s return type for the address field name: run `grep -n "address" src/lib/registry/school.ts | head`. If the field is not `address`, use the actual name; if none exists, pass `address: null`.

- [ ] **Step 4: Compress `YearSwitcher` into a pill**

Open `src/app/dashboard/_components/year-switcher.tsx`. Its root renders a card with the label "ACADEMIC YEAR", the select, and the span. Change only the presentational classes on the root and trigger so it renders as a 32px-high pill: root `className="border-line hover:bg-page flex h-8 items-center gap-2 rounded-lg border border-transparent px-2.5"`, hide the span text below `shell` (`className="shell:inline hidden …"`), keep the `FieldSelect` and the `TriangleAlert` warning exactly as they are. Do not touch the action logic. If the file's structure makes a class-only change impossible, leave it unchanged — it still works, just looks like a card — and note it in the commit message.

- [ ] **Step 5: Create `src/app/dashboard/template.tsx`**

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";

/// Re-mounts on every navigation, unlike layout, so it can fade each page in.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 6: Delete the old sidebar**

Run: `git rm src/app/dashboard/_components/app-sidebar.tsx src/app/dashboard/_components/dashboard-nav.tsx && grep -rn "app-sidebar\|dashboard-nav\|AppSidebar\|DashboardNav" src`
Expected: no references remain.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run && npx next build 2>&1 | tail -5`
Expected: pass. Then open `http://localhost:3000/dashboard` (log in if needed): top bar with brand, year pill, sun/moon, avatar; icon rail on the left; content fills the width; at < 864px the rail is a bottom bar and the avatar menu lists Classes/Subjects/Teaching.

- [ ] **Step 8: Commit**

```bash
git add -A src/app/dashboard
git commit -m "feat(shell): top bar, account menu, icon-rail grid layout, route fade; remove sidebar

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 6: Alerts popover

**Files:**
- Create: `src/lib/dashboard/alerts.ts`
- Create: `src/lib/dashboard/alerts.test.ts`
- Create: `src/app/dashboard/_components/alerts-popover.tsx`
- Modify: `src/app/dashboard/layout.tsx` (pass `alerts`)

**Interfaces:**
- Consumes: `SchoolOverview` from `src/lib/dashboard/overview.ts` (`today.missingAttendance: {id,label}[]`, `today.sectionsTotal`, `gaps.unpublishedExams`, `gaps.sectionsWithoutClassTeacher: {id,label}[]`, `gaps.unassignedSlots`), `getSchoolOverview(academicYearId, today)`.
- Produces: `dueItems(o: Pick<SchoolOverview,"today"|"gaps">): DueItem[]` with `DueItem = { key: string; label: string; href: string; tone: "warn" | "bad" | "neutral" }`; `<AlertsPopover items />`.

- [ ] **Step 1: Write the failing test** — `src/lib/dashboard/alerts.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { dueItems } from "./alerts";

const empty = {
  today: { date: new Date(), missingAttendance: [], sectionsTotal: 14, absent: 0 },
  gaps: { sectionsWithoutClassTeacher: [], unassignedSlots: 0, unpublishedExams: 0, examsTotal: 2 },
};

describe("dueItems", () => {
  it("is empty when nothing is due", () => {
    expect(dueItems(empty)).toEqual([]);
  });

  it("counts sections still to mark and links to roll call", () => {
    const items = dueItems({
      ...empty,
      today: { ...empty.today, missingAttendance: [{ id: 1, label: "Class 1 A" }, { id: 2, label: "Class 2 A" }] },
    });
    expect(items).toEqual([
      { key: "attendance", label: "2 sections still need roll call", href: "/dashboard/attendance", tone: "warn" },
    ]);
  });

  it("uses singular wording and lists every kind of gap", () => {
    const items = dueItems({
      today: { ...empty.today, missingAttendance: [{ id: 1, label: "Class 1 A" }] },
      gaps: {
        sectionsWithoutClassTeacher: [{ id: 3, label: "Class 3 A" }],
        unassignedSlots: 4,
        unpublishedExams: 1,
        examsTotal: 2,
      },
    });
    expect(items.map((i) => i.label)).toEqual([
      "1 section still needs roll call",
      "1 exam not published yet",
      "Class 3 A has no class teacher",
      "4 subject slots have no teacher",
    ]);
    expect(items.map((i) => i.href)).toEqual([
      "/dashboard/attendance",
      "/dashboard/exams",
      "/dashboard/classes",
      "/dashboard/assignments",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/dashboard/alerts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/dashboard/alerts.ts`**

```ts
import type { SchoolOverview } from "./overview";

export type DueItem = {
  key: string;
  label: string;
  href: string;
  tone: "warn" | "bad" | "neutral";
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/// What the office should look at today, in the order it matters. Pure so the
/// top bar and (later) the Overview welcome line agree.
export function dueItems(o: Pick<SchoolOverview, "today" | "gaps">): DueItem[] {
  const items: DueItem[] = [];

  const missing = o.today.missingAttendance.length;
  if (missing > 0) {
    items.push({
      key: "attendance",
      label: `${plural(missing, "section", "sections")} still ${missing === 1 ? "needs" : "need"} roll call`,
      href: "/dashboard/attendance",
      tone: "warn",
    });
  }

  if (o.gaps.unpublishedExams > 0) {
    items.push({
      key: "exams",
      label: `${plural(o.gaps.unpublishedExams, "exam", "exams")} not published yet`,
      href: "/dashboard/exams",
      tone: "neutral",
    });
  }

  for (const s of o.gaps.sectionsWithoutClassTeacher) {
    items.push({
      key: `class-teacher-${s.id}`,
      label: `${s.label} has no class teacher`,
      href: "/dashboard/classes",
      tone: "warn",
    });
  }

  if (o.gaps.unassignedSlots > 0) {
    items.push({
      key: "assignments",
      label: `${plural(o.gaps.unassignedSlots, "subject slot has", "subject slots have")} no teacher`,
      href: "/dashboard/assignments",
      tone: "neutral",
    });
  }

  return items;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/dashboard/alerts`
Expected: 3 passed.

- [ ] **Step 5: Create `alerts-popover.tsx`** (client)

```tsx
"use client";

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DueItem } from "@/lib/dashboard/alerts";
import { cn } from "@/lib/utils";

export function AlertsPopover({ items }: { items: DueItem[] }) {
  const n = items.length;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={n === 0 ? "Nothing needs attention" : `${n} ${n === 1 ? "thing needs" : "things need"} attention`}
        className="text-ink-2 hover:bg-page focus-visible:ring-ring/50 relative grid size-8 place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none"
      >
        <Bell className="size-4.5" aria-hidden="true" />
        {n > 0 ? (
          <span aria-hidden="true" className="bg-bad border-surface absolute top-1.5 right-1.5 size-2 rounded-full border-2" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="text-ink-3 px-3 pt-2 pb-1 text-[11px] font-medium tracking-[0.1em] uppercase">
          Needs attention
        </p>
        {n === 0 ? (
          <p className="text-ink-3 px-3 pb-3 text-sm">Everything is up to date.</p>
        ) : (
          <ul className="pb-1">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="hover:bg-page flex items-center gap-2.5 rounded-md px-3 py-2 text-sm no-underline"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      item.tone === "warn" && "bg-warn",
                      item.tone === "bad" && "bg-bad",
                      item.tone === "neutral" && "bg-ink-3",
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="text-ink-3 size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 6: Wire it in `layout.tsx`**

Add imports `import { getSchoolOverview } from "@/lib/dashboard/overview";`, `import { dueItems } from "@/lib/dashboard/alerts";`, `import { AlertsPopover } from "./_components/alerts-popover";`. After `const now = new Date();` add:

```tsx
  const overview = currentYear ? await getSchoolOverview(currentYear.id, now) : null;
  const alerts = overview ? dueItems(overview) : [];
```

and pass `alerts={<AlertsPopover items={alerts} />}` to `<TopBar>`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run`
Expected: pass. In the browser the bell shows a dot and lists "14 sections still need roll call".

- [ ] **Step 8: Commit**

```bash
git add src/lib/dashboard/alerts.ts src/lib/dashboard/alerts.test.ts src/app/dashboard/_components/alerts-popover.tsx src/app/dashboard/layout.tsx
git commit -m "feat(shell): alerts popover listing what is due today

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 7: Root redirect

**Files:**
- Modify: `src/app/page.tsx` (replace)

- [ ] **Step 1: Replace the template page**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/// The site root has no content of its own; send people where they can act.
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user?.id ? "/dashboard" : "/login");
}
```

- [ ] **Step 2: Remove the template assets no longer referenced**

Run: `grep -rn "next.svg\|vercel.svg\|file.svg\|globe.svg\|window.svg" src || echo "unreferenced"` then `git rm -q public/next.svg public/vercel.svg public/file.svg public/globe.svg public/window.svg 2>/dev/null; ls public`
Expected: "unreferenced"; only assets still used remain in `public/`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/`
Expected: tsc passes; curl prints `307 http://localhost:3000/login` (no cookie) if the dev server runs.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/page.tsx public
git commit -m "feat: root route redirects to dashboard or login; drop template assets

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 8: `EmptyState`, `StatusDot`, `Kpi`, `AttendanceStrip`

**Files:**
- Create: `src/components/ui/empty-state.tsx`, `src/components/ui/status-dot.tsx`, `src/components/ui/kpi.tsx`, `src/components/ui/attendance-strip.tsx`
- Create: `src/components/ui/attendance-strip.test.ts` (pure label helper)

**Interfaces:**
- Produces: `<EmptyState icon title description? action? />`; `<StatusDot tone children />` with `tone: "ok" | "warn" | "bad" | "neutral"`; `<Kpi value label hint? />`; `<AttendanceStrip days={DayStatus[]} percent? />` with `DayStatus = "present" | "absent" | "late" | "none"`; `describeStrip(days): string`.

- [ ] **Step 1: Write the failing test** — `src/components/ui/attendance-strip.test.ts`

```ts
import { expect, it } from "vitest";
import { describeStrip } from "./attendance-strip";

it("summarises a strip in words for assistive tech", () => {
  expect(describeStrip(["present", "present", "absent", "late", "none"])).toBe(
    "Last 5 days: 2 present, 1 absent, 1 late, 1 not taken",
  );
  expect(describeStrip([])).toBe("No attendance recorded");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/attendance-strip`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `attendance-strip.tsx`**

```tsx
import { cn } from "@/lib/utils";

export type DayStatus = "present" | "absent" | "late" | "none";

export function describeStrip(days: DayStatus[]): string {
  if (days.length === 0) return "No attendance recorded";
  const n = (s: DayStatus) => days.filter((d) => d === s).length;
  return `Last ${days.length} days: ${n("present")} present, ${n("absent")} absent, ${n("late")} late, ${n("none")} not taken`;
}

const TONE: Record<DayStatus, string> = {
  present: "bg-ok",
  absent: "bg-bad",
  late: "bg-warn",
  none: "bg-line",
};

/// One bar per day, oldest first. Colour carries the detail; the label carries
/// it for everyone else.
export function AttendanceStrip({
  days,
  percent,
  size = "sm",
  className,
}: {
  days: DayStatus[];
  percent?: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={describeStrip(days) + (percent == null ? "" : `, ${percent}% present`)}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {days.map((d, i) => (
        <i
          key={i}
          aria-hidden="true"
          className={cn("rounded-[2px] opacity-85", TONE[d], size === "sm" ? "h-3.5 w-1.5" : "h-5.5 w-full flex-1")}
        />
      ))}
      {percent == null ? null : (
        <em className="text-ink-3 ml-1.5 font-mono text-[11.5px] not-italic tabular-nums">{percent}%</em>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ui/attendance-strip`
Expected: 1 passed.

- [ ] **Step 5: Create `status-dot.tsx`**

```tsx
import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "bad" | "neutral";

const DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  neutral: "bg-ink-3",
};

/// A dot plus a word. The word is the status; the dot is a glance.
export function StatusDot({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-ink-2 inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
```

- [ ] **Step 6: Create `empty-state.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/// An empty screen is an invitation to act: one icon, one sentence, one action.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      <span className="bg-brand-tint text-brand-text grid size-11 place-items-center rounded-xl">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-1 text-sm font-medium">{title}</p>
      {description ? <p className="text-ink-3 max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 7: Create `kpi.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function Kpi({
  value,
  label,
  hint,
  className,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("bg-surface border-line rounded-[10px] border px-4 py-3", className)}>
      <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="text-ink-2 mt-1.5 text-sm">{label}</p>
      {hint ? <p className="text-ink-3 text-xs">{hint}</p> : null}
    </div>
  );
}
```

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run`
Expected: pass.

```bash
git add src/components/ui/empty-state.tsx src/components/ui/status-dot.tsx src/components/ui/kpi.tsx src/components/ui/attendance-strip.tsx src/components/ui/attendance-strip.test.ts
git commit -m "feat(ui): EmptyState, StatusDot, Kpi and AttendanceStrip primitives

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 9: `RegisterTabs` and `PageFrame`

**Files:**
- Create: `src/components/ui/register-tabs.tsx`
- Create: `src/components/ui/page-frame.tsx`

**Interfaces:**
- Produces: `<RegisterTabs tabs={RegisterTab[]} value onChange ariaLabel />` with `RegisterTab = { id: string; code: string; label: string; count?: number; empty?: boolean }`; `<PageFrame eyebrow title meta? actions?>` plus `PageFrame.Tabs`, `PageFrame.Toolbar`, `PageFrame.Body`, and `PageFrame.Split` (`children` = body column; props `aside`, `asideTitle`, `asideOpen`, `onAsideClose` — the aside is a 340px column from `split` up and a right Sheet below, with `asideOpen`/`onAsideClose` driving only the Sheet).
- Consumed by every Phase 2 page.

- [ ] **Step 1: Create `register-tabs.tsx`**

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type RegisterTab = {
  id: string;
  /// Short code shown in the badge: "KA", "1A", "ALL".
  code: string;
  label: string;
  count?: number;
  /// Marks a tab whose count is zero so it reads as a gap, not a quiet room.
  empty?: boolean;
};

/// A horizontal tab strip modelled on the tabbed paper attendance registers
/// Nepali schools keep: a code, the section name, and how many are on the roll.
export function RegisterTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  tabs: RegisterTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const layoutId = useId();

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === value);
    if (i < 0) return;
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0 || next >= tabs.length) return;
    e.preventDefault();
    onChange(tabs[next].id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
  }

  return (
    <div className={cn("border-line overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex min-w-max items-end gap-0.5">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "border-line bg-surface-2 text-ink-3 hover:bg-surface hover:text-ink relative flex h-[34px] items-center gap-2 rounded-t-lg border border-b-0 px-3 pl-2.5 font-medium transition-[background-color,color,height]",
                "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
                selected && "bg-surface text-ink border-line-strong h-[38px]",
              )}
            >
              {selected ? (
                <motion.span
                  layoutId={reduce ? undefined : layoutId}
                  aria-hidden="true"
                  className="bg-brand absolute inset-x-[-1px] top-[-1px] h-[3px] rounded-t-lg"
                />
              ) : null}
              <span
                className={cn(
                  "border-line bg-page text-ink-3 rounded px-1.5 py-px font-mono text-[10.5px] tracking-[0.04em]",
                  selected && "bg-brand-tint text-brand-text border-brand-tint-2",
                )}
              >
                {tab.code}
              </span>
              {tab.label}
              {tab.count == null ? null : (
                <span className={cn("font-mono text-[11.5px] tabular-nums", tab.empty ? "text-warn" : selected ? "text-ink-2" : "text-ink-3")}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `page-frame.tsx`**

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/// The one page skeleton every dashboard route renders. Owns padding, the
/// split-view grid, and the Sheet fallback for the aside below `split`.
export function PageFrame({
  eyebrow,
  title,
  meta,
  actions,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-col", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-3">
        <div className="min-w-0">
          <p className="text-ink-3 text-[11px] font-medium tracking-[0.1em] uppercase">{eyebrow}</p>
          <h1 className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5">
            {title}
            {meta ? <span className="text-ink-3 font-mono text-[13px] font-normal tracking-normal">{meta}</span> : null}
          </h1>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Tabs({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 px-4 shell:-mx-6 shell:px-6">{children}</div>;
}

function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {children}
    </div>
  );
}

/// Body + optional aside. The aside is a column from `split` up and a right
/// Sheet below it; `open`/`onClose` drive only the Sheet.
function Split({
  children,
  aside,
  asideTitle,
  asideOpen,
  onAsideClose,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  asideTitle?: string;
  asideOpen?: boolean;
  onAsideClose?: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("grid min-h-0 flex-1 gap-4", aside && "split:grid-cols-[1fr_340px]")}>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
      {aside ? (
        <>
          <motion.aside
            key="aside"
            initial={reduce ? false : { opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            aria-label={asideTitle}
            className="bg-surface border-line split:flex hidden min-h-0 flex-col overflow-y-auto rounded-[10px] border"
          >
            {aside}
          </motion.aside>
          <Sheet open={!!asideOpen} onOpenChange={(open) => { if (!open) onAsideClose?.(); }}>
            <SheetContent side="right" className="split:hidden w-full max-w-md overflow-y-auto p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{asideTitle ?? "Details"}</SheetTitle>
                <SheetDescription>Details for the selected row.</SheetDescription>
              </SheetHeader>
              {aside}
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface border-line min-h-0 flex-1 overflow-auto rounded-[10px] border", className)}>{children}</div>;
}

PageFrame.Tabs = Tabs;
PageFrame.Toolbar = Toolbar;
PageFrame.Split = Split;
PageFrame.Body = Body;
```

Check the generated `sheet.tsx` for the `side` prop name (`side="right"`). If it is absent, omit it — right is the default.

- [ ] **Step 3: Verify and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run && npx next build 2>&1 | tail -5`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/register-tabs.tsx src/components/ui/page-frame.tsx
git commit -m "feat(ui): RegisterTabs strip and PageFrame page contract with Sheet fallback

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 10: Table preferences

**Files:**
- Create: `src/lib/table/prefs.ts`
- Create: `src/lib/table/prefs.test.ts`

**Interfaces:**
- Produces: `TablePrefs = { density: "comfortable" | "compact"; pageSize: 25 | 50 | 100; hidden: string[] }`, `DEFAULT_PREFS`, `parsePrefs(raw: string | null): TablePrefs`, `loadPrefs(id: string): TablePrefs`, `savePrefs(id: string, prefs: TablePrefs): void`, `prefsKey(id) = "table:" + id`.

- [ ] **Step 1: Write the failing test** — `src/lib/table/prefs.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, prefsKey } from "./prefs";

describe("parsePrefs", () => {
  it("returns defaults for null or invalid JSON", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
  });
  it("keeps valid fields and repairs invalid ones", () => {
    expect(parsePrefs(JSON.stringify({ density: "compact", pageSize: 50, hidden: ["born"] }))).toEqual({
      density: "compact",
      pageSize: 50,
      hidden: ["born"],
    });
    expect(parsePrefs(JSON.stringify({ density: "huge", pageSize: 7, hidden: "born" }))).toEqual(DEFAULT_PREFS);
  });
});

it("namespaces the storage key", () => {
  expect(prefsKey("students")).toBe("table:students");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/table`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/table/prefs.ts`**

```ts
export type Density = "comfortable" | "compact";
export type PageSize = 25 | 50 | 100;
export type TablePrefs = { density: Density; pageSize: PageSize; hidden: string[] };

export const PAGE_SIZES: PageSize[] = [25, 50, 100];
export const DEFAULT_PREFS: TablePrefs = { density: "comfortable", pageSize: 25, hidden: [] };

export function prefsKey(id: string) {
  return `table:${id}`;
}

/// Tolerant of anything stored by an older build: each field is validated on
/// its own and falls back to the default.
export function parsePrefs(raw: string | null): TablePrefs {
  if (!raw) return DEFAULT_PREFS;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (typeof v !== "object" || v === null) return DEFAULT_PREFS;
  const o = v as Record<string, unknown>;
  return {
    density: o.density === "compact" ? "compact" : "comfortable",
    pageSize: PAGE_SIZES.includes(o.pageSize as PageSize) ? (o.pageSize as PageSize) : 25,
    hidden: Array.isArray(o.hidden) && o.hidden.every((h) => typeof h === "string") ? (o.hidden as string[]) : [],
  };
}

export function loadPrefs(id: string): TablePrefs {
  try {
    return parsePrefs(localStorage.getItem(prefsKey(id)));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(id: string, prefs: TablePrefs) {
  try {
    localStorage.setItem(prefsKey(id), JSON.stringify(prefs));
  } catch {
    // Storage blocked: the preference lives for this page only.
  }
}
```

- [ ] **Step 4: Run to verify it passes, commit**

Run: `npx vitest run src/lib/table`
Expected: 3 passed.

```bash
git add src/lib/table
git commit -m "feat(table): persisted table preferences (density, page size, hidden columns)

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 11: `DataTable` and `DetailPane`

**Files:**
- Create: `src/components/ui/data-table.tsx`
- Create: `src/components/ui/detail-pane.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-table` (`useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, flexRender, ColumnDef, SortingState, RowSelectionState, VisibilityState`), shadcn `Table*`, `DropdownMenu*`, `Skeleton`, `EmptyState`, `loadPrefs/savePrefs`.
- Produces:
  ```ts
  <DataTable<T>
    id: string                       // prefs namespace, e.g. "students"
    columns: ColumnDef<T, unknown>[] // TanStack columns; set meta: { numeric?: true, mono?: true } for alignment/font
    rows: T[]
    getRowId: (row: T) => string
    selectedId?: string | null       // highlighted row (drives the detail pane)
    onSelect?: (row: T) => void
    rowActions?: (row: T) => ReactNode   // hover-revealed cell
    empty: { icon; title; description?; action? }   // EmptyState props
    initialSort?: SortingState
  />
  // DataTable renders only the table and its footer (count, rows-per-page/density, columns, pager).
  // Search fields and filter chips are the page's job, placed in PageFrame.Toolbar above it.
  <DetailPane title subtitle initials photo? actions>  + DetailPane.Section (label + children) + DetailPane.Facts (items)
  ```

- [ ] **Step 1: Create `data-table.tsx`**

```tsx
"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Rows3 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_PREFS, PAGE_SIZES, loadPrefs, savePrefs, type TablePrefs } from "@/lib/table/prefs";
import { cn } from "@/lib/utils";

export type ColumnMeta = { numeric?: boolean; mono?: boolean; width?: string };

type EmptyProps = React.ComponentProps<typeof EmptyState>;

export function DataTable<T>({
  id,
  columns,
  rows,
  getRowId,
  selectedId,
  onSelect,
  rowActions,
  empty,
  initialSort = [],
  className,
}: {
  id: string;
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectedId?: string | null;
  onSelect?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  empty: EmptyProps;
  initialSort?: SortingState;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_PREFS);
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [pageIndex, setPageIndex] = useState(0);

  // Preferences come from localStorage, which does not exist on the server.
  useEffect(() => setPrefs(loadPrefs(id)), [id]);
  function updatePrefs(patch: Partial<TablePrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(id, next);
  }

  const columnVisibility = useMemo<VisibilityState>(
    () => Object.fromEntries(prefs.hidden.map((h) => [h, false])),
    [prefs.hidden],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnVisibility, pagination: { pageIndex, pageSize: prefs.pageSize } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize: prefs.pageSize }) : updater;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageRows = table.getRowModel().rows;
  const total = rows.length;
  const from = total === 0 ? 0 : pageIndex * prefs.pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * prefs.pageSize);
  const rowHeight = prefs.density === "compact" ? "h-[var(--row-compact)]" : "h-[var(--row)]";

  if (total === 0) return <EmptyState {...empty} />;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-surface-2 sticky top-0 z-[1]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const meta = (header.column.columnDef.meta ?? {}) as ColumnMeta;
                  const sort = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
                      style={meta.width ? { width: meta.width } : undefined}
                      className={cn(
                        "text-ink-3 h-9 px-2.5 text-[11.5px] font-medium tracking-[0.04em] uppercase whitespace-nowrap",
                        meta.numeric && "text-right",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "hover:text-ink inline-flex items-center gap-1 rounded focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
                            sort && "text-brand-text",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sort === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : sort === "desc" ? (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
                {rowActions ? <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pageRows.map((row, i) => {
              const rid = row.id;
              const selected = selectedId != null && rid === selectedId;
              return (
                <motion.tr
                  key={rid}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: Math.min(i, 12) * 0.02, ease: [0.2, 0.8, 0.2, 1] }}
                  tabIndex={onSelect ? 0 : undefined}
                  aria-selected={onSelect ? selected : undefined}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
                    onSelect?.(row.original);
                  }}
                  onKeyDown={(e) => {
                    if (!onSelect || (e.key !== "Enter" && e.key !== " ")) return;
                    if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
                    e.preventDefault();
                    onSelect(row.original);
                  }}
                  className={cn(
                    "border-line group border-b transition-colors last:border-b-0",
                    onSelect && "hover:bg-surface-2 cursor-default",
                    selected && "bg-brand-tint hover:bg-brand-tint",
                    "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none focus-visible:ring-inset",
                  )}
                >
                  {row.getVisibleCells().map((cell, ci) => {
                    const meta = (cell.column.columnDef.meta ?? {}) as ColumnMeta;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          rowHeight,
                          "px-2.5 py-0 whitespace-nowrap",
                          meta.numeric && "text-right",
                          meta.mono && "font-mono tabular-nums",
                          selected && ci === 0 && "shadow-[inset_3px_0_0_var(--brand)]",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                  {rowActions ? (
                    <TableCell className={cn(rowHeight, "px-2.5 py-0")}>
                      <span
                        data-row-actions
                        className={cn(
                          "inline-flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                          selected && "opacity-100",
                        )}
                      >
                        {rowActions(row.original)}
                      </span>
                    </TableCell>
                  ) : null}
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="text-ink-3 flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[12.5px]">
        <span>
          Showing <b className="text-ink font-mono font-medium">{from}–{to}</b> of{" "}
          <b className="text-ink font-mono font-medium">{total}</b>
        </span>
        <span className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Rows per page" className="border-line hover:bg-surface-2 inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono">
              <Rows3 className="size-3.5" aria-hidden="true" />
              {prefs.pageSize}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {PAGE_SIZES.map((n) => (
                <DropdownMenuItem key={n} onClick={() => { updatePrefs({ pageSize: n }); setPageIndex(0); }}>
                  {n} rows
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => updatePrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" })}>
                {prefs.density === "compact" ? "Comfortable rows" : "Compact rows"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Choose columns" className="border-line hover:bg-surface-2 inline-flex h-7 items-center rounded-md border px-2">
              <Columns3 className="size-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => {
                    const hidden = v ? prefs.hidden.filter((h) => h !== c.id) : [...prefs.hidden, c.id];
                    updatePrefs({ hidden });
                  }}
                >
                  {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            className="hover:bg-surface-2 grid size-7 place-items-center rounded-md disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="font-mono tabular-nums">{pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
          <button
            type="button"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            className="hover:bg-surface-2 grid size-7 place-items-center rounded-md disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}
```

If the generated `dropdown-menu.tsx` does not export `DropdownMenuCheckboxItem`, replace those items with plain `DropdownMenuItem`s that render a `Check` icon when visible.

- [ ] **Step 2: Create `detail-pane.tsx`**

```tsx
import { cn } from "@/lib/utils";

/// The aside shell: identity block, action row, then labelled sections.
export function DetailPane({
  title,
  subtitle,
  initials,
  photo,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  initials: string;
  photo?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="border-line flex items-start gap-3 border-b px-5 pt-[18px] pb-3.5">
        {photo ?? (
          <span
            aria-hidden="true"
            className="from-brand-tint-2 to-brand-tint text-brand-text font-display grid size-13 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg font-bold"
          >
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-semibold tracking-[-0.015em]">{title}</p>
          {subtitle ? <p className="text-ink-3 mt-0.5 text-[12.5px]">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="border-line flex gap-1.5 border-b px-5 py-3">{actions}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-line border-b px-5 py-3.5 last:border-b-0", className)}>
      <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">{label}</h2>
      {children}
    </section>
  );
}

/// Two-column label/value grid for the Record section.
function Facts({ items }: { items: { label: string; value: React.ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-ink-3 text-[11.5px]">{f.label}</dt>
          <dd className={cn("mt-px truncate font-medium", f.mono && "font-mono tabular-nums")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

DetailPane.Section = Section;
DetailPane.Facts = Facts;
```

- [ ] **Step 3: Verify (types only — the components are exercised by Phase 2 pages)**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run`
Expected: pass. If `motion.tr` typing complains about `aria-selected`, cast: `aria-selected={onSelect ? (selected as boolean) : undefined}`; if it complains about `onClick` typing, use `motion.create("tr")` at module scope: `const MotionTr = motion.create("tr");`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/data-table.tsx src/components/ui/detail-pane.tsx
git commit -m "feat(ui): DataTable (sort, paginate, column visibility, density) and DetailPane

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 12: Smoke script, ESLint scope, final gate

**Files:**
- Create: `scripts/ui-smoke.cjs`
- Modify: `eslint.config.mjs`
- Modify: `package.json` (add `"smoke": "node scripts/ui-smoke.cjs"`)

**Interfaces:**
- `SMOKE_USER` / `SMOKE_PASS` env vars; writes `artifacts/smoke/<route>-<width>-<theme>.png`.

- [ ] **Step 1: Exclude `scripts/**` from the `require()` rule**

Open `eslint.config.mjs`; add to the exported array (after the existing entries):

```js
  {
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
```

- [ ] **Step 2: Create `scripts/ui-smoke.cjs`**

```js
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
  "dashboard/teachers",
  "dashboard/classes",
  "dashboard/subjects",
  "dashboard/assignments",
  "dashboard/attendance",
  "dashboard/exams",
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
        const name = `${route.replace(/\//g, "_")}-${width}-${theme}.png`;
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
```

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`, add `"smoke": "node scripts/ui-smoke.cjs"`.

- [ ] **Step 4: Run the full gate**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint . && npx vitest run && DB_TESTS=1 npx vitest run && npx next build 2>&1 | tail -5`
Expected: tsc clean; **ESLint 0 problems** (the `seed.cjs` errors are gone); unit + DB suites all pass (≥ 190 + the new tests); build succeeds.

- [ ] **Step 5: Run the smoke and look**

Run: `SMOKE_USER=<user> SMOKE_PASS=<pass> npm run smoke 2>&1 | tail -3 && ls artifacts/smoke | wc -l`
Expected: 54 PNGs. Open `dashboard-1440-light.png`, `dashboard-1440-dark.png`, `dashboard_students-390-light.png`: top bar + rail present, dark theme applied, bottom bar on mobile, no horizontal page scroll. Fix anything wrong before committing.

- [ ] **Step 6: Commit**

```bash
git add scripts/ui-smoke.cjs eslint.config.mjs package.json
git commit -m "chore: UI smoke screenshot script; scope ESLint require rule to TS/TSX

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

## Phase 1 exit criteria

- All existing pages render inside the new shell with the new tokens and fonts, in light and dark, at 1440/1000/390.
- `PageFrame`, `RegisterTabs`, `DataTable`, `DetailPane`, `EmptyState`, `StatusDot`, `Kpi`, `AttendanceStrip` exist, type-check, and are ready for Phase 2 (page migrations, starting with Students as the reference).
- Tests: 190 existing + `theme` (4) + `nav-model` (5) + `alerts` (3) + `attendance-strip` (1) + `prefs` (3) = 206, all green with `DB_TESTS=1`.

## Handled in later phases (not gaps)

- Spec §6 page migrations, `?student=` deep link, `[id]` route removal → Phase 2 plan.
- Spec §8.1 global search (top-bar centre slot is reserved), §8.3 skeletons/`error.tsx`/`not-found.tsx`, §7.3–7.4 rebasing and deletions, legacy token removal, `getStudentSummary`/`getStaffSummary` → Phase 3 plan (search/skeletons) and Phase 2 (summaries, with the pages that need them).
