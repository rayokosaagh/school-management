# Option C redesign — design spec

**Date:** 2026-08-29
**Project:** school-management (Next.js 16, React 19, Tailwind 4, shadcn base-nova on `@base-ui/react`, Prisma 6, NextAuth 5, Vitest 4, `motion`)
**Mockup:** `artifacts/option-c-mockup.html` (interactive; `mock-*.png` previews)
**Status:** approved in conversation, section by section

## 1. Goal

Replace the current stacked-card, sidebar dashboard with a data-first shell — top bar + icon rail + split view — under a single indigo identity, and make every page follow one page contract so the UI is consistent by construction rather than by discipline. Add the four missing UX features (mobile navigation + account menu, dark mode, global search, table upgrades) and a welcome header on Overview.

Non-goals: auth/permission logic, Prisma schema, print marksheet layout, CSV exports, bulk actions, a notifications subsystem, CSV import, saved views.

## 2. Audience and constraints

- Users are school office staff and teachers in Nepal doing long data-entry sessions. Dates are Bikram Sambat; names have Devanagari forms; roll numbers and admission numbers are the primary identifiers.
- The app already has 190 passing Vitest tests (unit + DB integration behind `DB_TESTS=1`). They must stay green at every step.
- All existing server actions keep their signatures. Only the components that call them move.
- No new persistent state except `localStorage` for theme, table density/page size, and recent search items.

## 3. Foundation

### 3.1 Tokens (`src/app/globals.css`)

Replace the achromatic shadcn set and the `--tint-*` layer with one scale, defined for `:root` and `.dark`. The existing shadcn variable names (`--primary`, `--card`, `--border`, `--ring`, …) are kept but re-pointed at the new values so `Button`/`Input`/`Select` keep working during migration.

| Token | Role |
|---|---|
| `--brand`, `--brand-deep`, `--brand-tint`, `--brand-tint-2`, `--brand-text`, `--brand-ink` | the only action colour: buttons, links, active nav, selected rows/tabs, focus ring |
| `--page`, `--surface`, `--surface-2`, `--line`, `--line-strong` | backgrounds and hairlines (`--surface-2` = table heads, resting tabs) |
| `--ink`, `--ink-2`, `--muted` | text |
| `--ok`, `--warn`, `--bad` + `--ok-tint`, `--warn-tint`, `--bad-tint` | status; replaces every raw `emerald-*`, `amber-*`, `red-*` class |
| `--radius-control: 8px`, `--radius-panel: 10px`, `--radius-overlay: 14px` | the whole radius scale |
| `--rail: 64px`, `--topbar: 56px`, `--row: 38px` | shell dimensions |

Light values are the mockup's (`#4338CA` brand, `#F5F6FA` page, `#111327` ink, …) converted to OKLCH. Dark values follow the mockup's `[data-theme="dark"]` block. Status is never colour-only: a dot or icon always pairs with a word.

`card-surface` utility, `--tint-*`, `--action`, `--rail` (colour) are removed after migration.

### 3.2 Typography

Loaded with `next/font/google` in `src/app/layout.tsx`:

- **Bricolage Grotesque** (`--font-display`) — `h1`, detail-pane titles, KPI numbers, the Overview welcome line.
- **Geist** (`--font-body`) — everything else; base 13.5px / 1.45.
- **Geist Mono** (`--font-mono`) — roll, admission no., BS/AD dates, phone numbers; always `tabular-nums`.
- **Noto Sans Devanagari** — stays in the sans fallback stack; Nepali names render under English names in tables and panes.

Scale: `h1` 26px/600 display (22px below 860px); section label 11px uppercase, `.1em` tracking, muted; body 13.5; meta 12.5; micro 11. `--font-heading` alias is removed.

### 3.3 Motion

All via `motion/react`, all gated on `useReducedMotion()`:

- table rows rise in, 4px / 0.32s, 20ms stagger, capped at 12 rows;
- detail pane slides in from the right, 10px / 0.35s;
- palette/dialog pops, 0.16s;
- register-tab underline slides between tabs (`layoutId`);
- route change: `src/app/dashboard/template.tsx` fades content 120ms.

No looping animation anywhere. `MorphingSquare` is deleted; loading uses skeletons.

## 4. Shell

`src/app/dashboard/layout.tsx` renders:

```
<div class="grid" rows: topbar 1fr; cols: rail 1fr>
  <TopBar/>          server component, spans both columns
  <IconRail/>        client component (aria-current from usePathname)
  <main/>            full width, no max-w container
</div>
```

### 4.1 TopBar (`_components/top-bar.tsx`)

Left: brand mark (initial letter on indigo gradient), school name, "place · BS date". Centre: `GlobalSearch` trigger (looks like a search field, shows `Ctrl K` kbd). Right: `YearSwitcher` compressed to a pill (`Year 2083 ▾`), `AlertsButton`, `ThemeToggle`, `AccountMenu` avatar.

- **AccountMenu** — shadcn `DropdownMenu`: name + role, Settings, Switch theme, Sign out. Below 860px it also lists Classes, Subjects, Teaching (the rail groups hidden on mobile).
- **AlertsButton** — dot when `getOverview()` reports anything due (sections not marked today, unpublished exams past their end date). Opens a `Popover` listing each item with a link. Reuses `src/lib/dashboard/overview.ts`; no new data.
- **ThemeToggle** — sun/moon button, `aria-pressed`, label flips.

### 4.2 IconRail (`_components/icon-rail.tsx`)

64px wide, icon + 10.5px label, 52px items. Groups: Overview · Students · Staff | Classes · Subjects · Teaching | Roll call · Exams | (spacer) | Settings. Filtered by the existing `allowed` list computed in the layout. Active = `--brand-tint` background + `--brand-text`, `aria-current="page"`.

### 4.3 Theme

`src/lib/theme/theme.ts` (pure: resolve stored/system preference) + `src/components/ui/theme-toggle.tsx` + an inline no-flash `<script>` in `src/app/layout.tsx` that sets `class="dark"` on `<html>` before paint. Preference in `localStorage["theme"]` as `light | dark | system`. Print media forces the light set.

### 4.4 Root route

`src/app/page.tsx` becomes a server redirect: signed in → `/dashboard`, else → `/login`. The create-next-app template is deleted.

## 5. Responsive behaviour

| Width | Rail | Detail pane | Top bar |
|---|---|---|---|
| ≥ 1180px | left, 64px | 340px column in the split view | full |
| 860–1179px | left, 64px | hidden; row click opens the same content in a right `Sheet` | full |
| < 860px | bottom tab bar: Overview, Students, Staff, Roll call, Exams (52px, safe-area padded) | `Sheet` | mark · search icon · year · avatar |

Tables keep the existing per-cell-label stacking below 640px. The register tab strip scrolls horizontally with hidden scrollbar. Nothing may scroll the page horizontally.

## 6. Page contract

Every dashboard route renders `PageFrame` (`src/components/ui/page-frame.tsx`):

```
<PageFrame eyebrow title meta actions>
  <PageFrame.Tabs>      optional RegisterTabs
  <PageFrame.Toolbar>   search field, filter chips, count, density/columns buttons
  <PageFrame.Body>      the page's main surface
  <PageFrame.Aside>     optional DetailPane (split view)
</PageFrame>
```

`PageFrame` owns padding (24px, 16px mobile), the split-view grid, and the `Sheet` fallback for the aside. Pages never set their own max-width, except Settings whose forms are wrapped at `max-w-2xl` inside the body.

| Route | Tabs | Body | Aside |
|---|---|---|---|
| `/dashboard` | — | Welcome header, KPI strip, Roll call today, Needs attention, 14-day attendance | — |
| `/dashboard/students` | sections (+ All) | `DataTable` | `StudentPane` |
| `/dashboard/teachers` | designation (All / Teaching / Office / Leadership) | `DataTable` | `StaffPane` |
| `/dashboard/classes` | academic years | grades × sections table | grade editor |
| `/dashboard/subjects` | Subjects / Grade offerings | `DataTable` / offerings grid | subject editor |
| `/dashboard/assignments` | sections | assignment matrix | teacher picker |
| `/dashboard/attendance` | sections | attendance sheet (logic unchanged) | day summary + year heat-map |
| `/dashboard/exams` | exam terms | marks grid | exam settings + publish |
| `/dashboard/exams/print` | — | marksheets (unchanged) | — |
| `/dashboard/settings` | School / Accounts / Permissions | forms | — |

**Detail routes.** `/dashboard/students/[id]` and `/dashboard/teachers/[id]` are removed. The list page reads `?student=<id>` / `?staff=<id>` to pre-select a row, so existing links and the print page's back-links keep working. The server actions in those folders move to `students/actions.ts` and `teachers/actions.ts` unchanged.

**Add forms.** The "Add X" panels at the top of each page are removed; the page's primary action button opens a right `Sheet` containing the existing form component. `AddPanel` is deleted.

**Empty states.** One `EmptyState` (icon, one sentence, one action) replaces `RecordTable`'s built-in, the bare `<p>` variants, and the "closed sign-up" hand-rolled callout.

**Feedback.** Toast stays the single feedback channel in the dashboard. Auth pages keep inline `role="alert"` (there is no toast provider outside the dashboard) but use the same styling tokens. `email-form.tsx` moves to toast.

## 7. Components

### 7.1 Installed from the shadcn base-nova registry

`dialog`, `sheet`, `dropdown-menu`, `popover`, `command`, `tooltip`, `table`, `tabs`, `skeleton`, `badge`, `scroll-area`. Added with `npx shadcn@latest add …` so they land in `src/components/ui/` in the project's own style.

Verified 2026-08-29: `https://ui.shadcn.com/r/styles/base-nova/{command,sheet,dropdown-menu,table,skeleton}.json` all resolve, so `GlobalSearch` is built on `command`.

### 7.2 New

| Component | Responsibility |
|---|---|
| `page-frame.tsx` | Section 6 layout contract |
| `top-bar.tsx`, `icon-rail.tsx`, `account-menu.tsx`, `alerts-popover.tsx`, `theme-toggle.tsx` | Section 4 |
| `register-tabs.tsx` | horizontal tab strip: code badge, label, count; `aria-selected`; empty tabs show count in `--warn`; underline animates |
| `data-table.tsx` | TanStack Table v8 wrapper: columns, sortable headers with `aria-sort`, client pagination (25/50/100), select-all + per-row checkboxes with selected count, column visibility menu, density toggle (comfortable 38px / compact 32px), sticky header, hover-revealed row actions, keyboard row focus, selected row → `onSelect(row)`. Client-side only; data sizes are hundreds of rows. |
| `detail-pane.tsx` | aside shell: header (photo/initials, title, subtitle), action row, `Section` children; renders inline ≥ 1180px, as `Sheet` below |
| `empty-state.tsx` | Section 6 |
| `status-dot.tsx` | dot + word; tones ok/warn/bad/neutral |
| `attendance-strip.tsx` | N-day present/absent/late/untaken strip with `%` and an `aria-label` sentence |
| `kpi.tsx` | number in display face + label + optional delta; used on Overview |
| `global-search.tsx` | Section 8.1 |
| `brand-mark.tsx` | replaces `Logo` from `login-signup.tsx` |

### 7.3 Rebased

- `modal.tsx` → thin wrapper over `dialog` (focus trap, `aria-labelledby`, Escape, scroll lock come from base-ui).
- `add-panel.tsx` / `add-panel-shell.tsx` → deleted; callers use `Sheet`.
- `tab-panels.tsx` → deleted; callers use `RegisterTabs`.
- `toast.tsx` → same API (`useToastedActionState` untouched), restyled with tokens.
- `confirm-submit.tsx` → unchanged.
- `attendance-map.tsx`, `marksheet.tsx`, `marks-grid.tsx`, `permission-matrix.tsx` → colour classes replaced by tokens; pass/fail and allowed/denied gain an icon or word.

### 7.4 Deleted

`record-table.tsx`, `rail-nav.tsx` (and its inline copy in `subjects/_components/grade-offerings.tsx`), `dashboard-nav.tsx`, `login-signup.tsx`, `morphing-square.tsx`, `add-panel*.tsx`, `tab-panels.tsx`, `students/[id]/` and `teachers/[id]/` route folders (photo-form components move to `students/_components/` and `teachers/_components/`).

## 8. Features

### 8.1 Global search

- `src/lib/search/global.ts`: `searchEverything(q: string, actor: Actor): Promise<SearchResults>` with `{ students, staff, sections, subjects, pages }`, max 5 per group. Matching: case-insensitive prefix first, then contains, on English full name, Nepali full name, admission no., guardian phone (students); name, Nepali name, phone (staff); "Grade Section" label (sections); name and code (subjects). Students and sections are limited to `allowedSectionIds(actor)`. Pages are the nav entries the actor may see.
- Exposed through a server action `search(q)` in `src/app/dashboard/actions.ts`; the client debounces 150ms and ignores stale responses.
- `global-search.tsx`: opened by the top-bar trigger, `Ctrl+K` / `Cmd+K`, or `/` when focus is not in an input. Groups: results (as above) then Actions (Admit student, Add staff, Take roll call, Enter marks, Switch theme, Sign out) filtered by permission. Arrow keys, Enter, Escape. Selecting a student/staff navigates to the list page with `?student=` / `?staff=`; a section opens Students on that tab; a subject opens Subjects. Last 5 picks kept in `localStorage["search:recent"]` and shown when the query is empty.

### 8.2 Dark mode

Section 4.3. Every new component is checked in both themes in the smoke run. Print forces light.

### 8.3 Table upgrades

Section 7.2 `data-table.tsx`. Persisted per table id in `localStorage["table:<id>"]`: density, page size, hidden columns. Route-level `loading.tsx` skeletons for `students`, `teachers`, `attendance`, `exams`, mirroring the `PageFrame` shape (header, tab strip, 8 rows). `src/app/dashboard/error.tsx` (message + "Try again") and `not-found.tsx`.

### 8.4 Mobile navigation and account menu

Sections 4.1, 4.2, 5.

### 8.5 Overview welcome

`src/app/dashboard/page.tsx` opens with a welcome block: greeting by local time-of-day + username, BS date in the display face, and a one-line "due today" sentence composed from `getOverview()` (e.g. "14 sections still need roll call · Second Terminal marks close in 3 days"). When nothing is due: "Everything is up to date." Below it: KPI strip (Students, Staff, Sections, Offerings) reusing the existing counts, then the existing Roll-call-today, Attendance, Needs-attention cards restyled onto `PageFrame`.

## 9. Data

No schema or migration changes. New read functions, each with a unit or DB test:

- `searchEverything` — `src/lib/search/global.ts`
- `getStudentSummary(id, academicYearId)` — `src/lib/registry/students.ts`: record, primary guardian, attendance % + last-14-day statuses (composes `src/lib/attendance/attendance.ts`), per-exam percentage and publish state (composes `src/lib/assessment/exams.ts`), enrolment history.
- `getStaffSummary(id, academicYearId)` — `src/lib/registry/staff.ts`: contact, class-teacher sections, teaching load, linked user account.

## 10. Accessibility requirements

- Every icon-only button has `aria-label`; every table header that sorts has `aria-sort`; the tab strip is `role="tablist"` with `aria-selected`.
- Rows are focusable (`tabindex=0`), select on Enter/Space, and do not nest interactive controls inside a `role="button"` (row actions are real buttons in their own cell).
- Dialogs, sheets and the palette trap and restore focus (from base-ui).
- Contrast ≥ 4.5:1 for text in both themes; status never colour-only.
- `prefers-reduced-motion` disables all animation.
- The date input on Roll call gets a visible label.

## 11. Testing

- **Unit (Vitest):** `theme.test.ts` (preference resolution), `global.test.ts` (ranking, limits, scoping — DB test behind `DB_TESTS`), `students.summary.integration.test.ts`, `staff.summary.integration.test.ts`, `data-table` helper functions (sort comparator, page slicing) as pure functions in `src/lib/table/`.
- **Existing 190 tests** run after every migration step; none may be skipped or deleted.
- **Smoke:** `scripts/ui-smoke.cjs` (Playwright via Edge, as used in this session) logs in, visits every route at 1440 / 1000 / 390 px in light and dark, opens the palette, and writes screenshots to `artifacts/smoke/`. Run manually before finishing each page; not a CI gate.
- `npm run lint`, `tsc --noEmit`, `next build` must pass at the end of every step. `scripts/**` is excluded from ESLint's `no-require-imports`.

## 12. Migration order

Each step leaves the app working and tests green.

1. Tokens, fonts, radius scale, motion helpers; re-point shadcn variables. Visual change only.
2. Shell: `TopBar`, `IconRail`, `ThemeToggle`, `AccountMenu`, `AlertsPopover`, mobile bottom bar, `/` redirect. Old sidebar deleted.
3. Install shadcn primitives; build `PageFrame`, `RegisterTabs`, `DataTable`, `DetailPane`, `EmptyState`, `StatusDot`, `AttendanceStrip`, `Kpi`.
4. Students page on the new contract (reference implementation), incl. `getStudentSummary`, `?student=` deep link, `[id]` route removal.
5. Staff page (same pattern), `[id]` route removal.
6. Classes, Subjects, Teaching.
7. Roll call.
8. Exams (print page untouched except tokens).
9. Settings.
10. Overview welcome + KPI strip.
11. Global search.
12. Skeletons, `error.tsx`, `not-found.tsx`.
13. Delete dead components and utilities; ESLint config for `scripts/`.
14. Smoke screenshots, both themes, three widths; fix what they show.

## 13. Decisions verified 2026-08-29

- The base-nova registry ships `command`, `sheet`, `dropdown-menu`, `table`, `skeleton` (Section 7.1) — no fallback needed.
- `@tanstack/react-table` **v8** (`^8`) is the dependency for `data-table.tsx` — it supports React 19 and exposes the `useReactTable`/`getCoreRowModel` API used in the plan. 9.x was tried first and rejected during implementation: it replaces that API with `useTable` + feature modules. No in-house table state.
