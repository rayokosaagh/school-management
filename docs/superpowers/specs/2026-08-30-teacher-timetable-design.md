# Teacher timetable — design spec

**Date:** 2026-08-30
**Project:** school-management (Next.js 16, React 19, Tailwind 4, shadcn base-nova on `@base-ui/react`, Prisma 6, NextAuth 5, Vitest 4, `motion`)
**Follows:** `docs/superpowers/specs/2026-08-29-option-c-redesign-design.md` — this feature adopts that spec's page contract (§6), tokens (§3.1), motion rules (§3.3) and accessibility floor (§10) rather than inventing its own.
**Status:** approved in conversation

## 1. Goal

Give the school a way to build a weekly class timetable, and make the teacher's "Today" panel on Overview show real lessons.

The read half already exists and is uncommitted on `redesign/phase-2`: the `TimetablePeriod` model, migration `20260830090000_teacher_timetable`, `src/lib/dashboard/teacher-schedule.ts`, and `TeacherScheduleToday` at `src/app/dashboard/page.tsx:119`. Nothing writes a `TimetablePeriod` except that module's own integration test — `scripts/seed.cjs` does not either — so today every teacher's Overview renders "Your timetable is clear for today", permanently. This spec builds the write half.

Non-goals: substitute and cover teachers, rooms as bookable entities with their own clash rules, per-grade bell schedules, automatic timetable generation, term-dated timetable versions, printing or CSV export, and any student- or guardian-facing view.

## 2. Decisions taken

| Question | Decision | Why |
|---|---|---|
| Who may build it | A new `manage:timetable` capability, default `ADMIN` + `OFFICE` | Schools hand timetabling to one person — a head teacher or timetable in-charge — who is not necessarily allowed to edit student records. The permission matrix exists to express exactly that; reusing `manage:registry` would make the two inseparable. |
| Where period times come from | One school-wide bell schedule, stored as ordered `SchoolPeriod` rows | The grid needs to know its columns before a single lesson exists. It also collapses clash detection from interval-overlap arithmetic to cell equality. |
| Primary editing surface | Section-first grid, subject-only cells | `TeacherAssignment` already answers "who teaches Maths to 5A", so a cell needs one choice, not two, and a section can never be given a subject its grade is not taught. |
| Teacher week | Read-only projection of the same rows | Two writable surfaces would double the client code and the write paths to test for no new capability. |
| Working days | `SchoolProfile.workingDays`, default Sunday–Friday | Saturday is the weekly holiday in Nepal, but the school day differs enough between schools to be worth a setting rather than a constant. |

## 3. Data model

### 3.1 New — `SchoolPeriod`

```prisma
/// The school's bell schedule: the named slots every section's week is built
/// from. Break rows carry no lesson but keep the grid honest about the gap.
/// `order` is not unique, so the whole schedule can be renumbered in one
/// transaction without rows colliding mid-flight; contiguity is a service rule.
model SchoolPeriod {
  id          Int     @id @default(autoincrement())
  order       Int
  name        String
  startMinute Int
  endMinute   Int
  isBreak     Boolean @default(false)

  periods TimetablePeriod[]

  @@index([order])
}
```

### 3.2 Altered — `TimetablePeriod`

- **Drops** `startMinute` and `endMinute`; **gains** `schoolPeriodId`. One source of truth for times: editing the bell moves every lesson with it, instead of leaving stale minute pairs behind.
- **Gains** `sectionId`, denormalised from `assignment.sectionId`, carrying `@@unique([sectionId, dayOfWeek, schoolPeriodId])`. This is the constraint that matters — *one lesson per section per slot* — and it cannot be expressed through the assignment, because `sectionId` lives a table away. `setTimetableCell` is the only writer and always sets it equal to `assignment.sectionId`.
- `room` becomes `String @default("")`. Requiring a room per cell is friction the section-first grid does not need; blank means "not recorded".
- The old `@@unique([teacherAssignmentId, dayOfWeek, startMinute])` becomes `@@unique([teacherAssignmentId, dayOfWeek, schoolPeriodId])`.

```prisma
model TimetablePeriod {
  id                  Int    @id @default(autoincrement())
  teacherAssignmentId Int
  /// Denormalised from the assignment so the one-lesson-per-slot rule can be a
  /// database constraint rather than a hope.
  sectionId           Int
  schoolPeriodId      Int
  /// Sunday = 0 through Saturday = 6, matching JavaScript's getDay().
  dayOfWeek           Int
  room                String @default("")

  assignment   TeacherAssignment @relation(fields: [teacherAssignmentId], references: [id], onDelete: Cascade)
  section      Section           @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  schoolPeriod SchoolPeriod      @relation(fields: [schoolPeriodId], references: [id], onDelete: Cascade)

  @@unique([sectionId, dayOfWeek, schoolPeriodId])
  @@unique([teacherAssignmentId, dayOfWeek, schoolPeriodId])
  @@index([dayOfWeek])
}
```

**Teacher double-booking is deliberately *not* a database constraint.** Denormalising `staffId` and making it unique would make clashes structurally impossible, but it would also make `setSubjectTeacher` on the Teaching page fail with an opaque Prisma error whenever a reassignment happened to collide. Clashes are rejected in `setTimetableCell` and surfaced by an audit (§5.4) instead, so a registry edit stays possible and its consequence stays visible.

### 3.3 Altered — `SchoolProfile`

```prisma
  workingDays Int[] @default([0, 1, 2, 3, 4, 5])
```

`getSchool()` returns `null` until the profile is filled in, so `getWorkingDays()` falls back to `DEFAULT_WORKING_DAYS` the way `getLetterhead()` already falls back to a placeholder masthead.

### 3.4 Migration

A **second** migration, `20260830120000_bell_schedule`, stacked on the untracked `20260830090000_teacher_timetable` rather than rewriting it. That migration may already be applied to the developer's database; editing it in place would force a `migrate reset` and destroy the seeded dev data for no benefit. `TimetablePeriod` is empty everywhere, so dropping its two minute columns needs no backfill.

**Destructive edge, and how the UI handles it.** `TimetablePeriod.schoolPeriodId` cascades, so deleting a bell period deletes every lesson in that column. This is correct behaviour, not a bug — but it must never be a surprise. `saveBellSchedule` therefore updates surviving rows by id and only deletes rows the editor actually removed, and the School-day form counts the lessons at risk and requires confirmation: *"Removing Period 7 will delete 12 scheduled lessons."*

## 4. Permissions

`src/lib/auth/roles.ts`:

```ts
  /// Build the weekly class timetable and set the school day.
  | "manage:timetable"
```

- Added to `CAPABILITIES` immediately after `manage:registry`, which is where the settings matrix will show it.
- `CAPABILITY_LABEL`: "Build the class timetable".
- `CAPABILITY_NOTE`: "Teachers always see their own timetable, whether or not this is granted."
- `DEFAULT_GRANTS`: added to `ADMIN` and `OFFICE`; `TEACHER` unchanged.
- `ROUTE_CAPABILITY`: `{ prefix: "/dashboard/timetable", capability: "manage:timetable" }`.

That one route entry buys both the `requirePage` guard and rail visibility, because `src/app/dashboard/layout.tsx:40` derives the `allowed` list from `capabilityFor`. The settings matrix picks the new row up from `CAPABILITIES` with no further wiring. Nothing else changes in the auth layer: the teacher's own schedule is already scoped by `actor.staffId` inside `getTeacherScheduleForToday`, with no capability involved.

## 5. Service layer — `src/lib/timetable/`

### 5.1 `bell.ts`

```ts
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 5];
export const DEFAULT_BELL: BellInput[];          // P1–P7 around a tiffin break

export type BellPeriod = {
  id: number; order: number; name: string;
  startMinute: number; endMinute: number; isBreak: boolean;
};
export class BellScheduleError extends Error {}

export function validateBell(rows: BellInput[]): void;      // pure — unit tested
export function listBellPeriods(): Promise<BellPeriod[]>;
export function saveBellSchedule(rows: BellInput[]): Promise<void>;
export function getWorkingDays(): Promise<number[]>;
export function setWorkingDays(days: number[]): Promise<void>;
```

`validateBell` rules, all pure and unit-tested: at least one row; `order` contiguous from 0; `0 <= startMinute < endMinute <= 1440`; no two rows overlap; names non-empty, trimmed and unique.

`DEFAULT_BELL` is a starting point the school edits, not a constant anything depends on — a seven-period day around a tiffin break:

| Order | Name | Start | End | Break |
|---|---|---|---|---|
| 0 | Period 1 | 10:00 | 10:45 | |
| 1 | Period 2 | 10:45 | 11:30 | |
| 2 | Period 3 | 11:30 | 12:15 | |
| 3 | Tiffin | 12:15 | 12:45 | ● |
| 4 | Period 4 | 12:45 | 13:30 | |
| 5 | Period 5 | 13:30 | 14:15 | |
| 6 | Period 6 | 14:15 | 15:00 | |
| 7 | Period 7 | 15:00 | 15:45 | |

### 5.2 `grid.ts`

```ts
export type GridOption = {
  subjectOfferingId: number; subjectName: string;
  staffId: number | null; staffName: string | null;
};
export type GridCell = {
  /// The TimetablePeriod row's own id — the lesson, not the bell slot.
  id: number;
  dayOfWeek: number; schoolPeriodId: number;
  subjectOfferingId: number; subjectName: string;
  staffId: number; staffName: string; room: string;
};
export type SectionGrid = {
  section: { id: number; name: string; gradeName: string };
  cells: GridCell[];
  options: GridOption[];
};

export function getSectionGrid(sectionId: number): Promise<SectionGrid | null>;
export function countFilledBySection(academicYearId: number): Promise<Map<number, number>>;
```

`options` is every offering the section's grade is taught this year, each carrying its assigned teacher — or `null`, which the grid renders as "no teacher assigned yet" rather than a silent gap. `countFilledBySection` feeds the tab counts, so a section with nothing scheduled reads as a gap (`empty: true` → `--warn`) exactly as an empty Students tab does.

### 5.3 `cells.ts`

```ts
export class TimetableCellError extends Error {}
export class TimetableClashError extends TimetableCellError {}

export function setTimetableCell(input: {
  sectionId: number; schoolPeriodId: number; dayOfWeek: number;
  subjectOfferingId: number | null; room?: string;
}): Promise<void>;
```

Rules, in order, each with its own message:

1. The bell period exists and is not a break — *"Breaks carry no lessons."*
2. `dayOfWeek` is one of the school's working days.
3. `subjectOfferingId === null` clears the cell and returns. Clearing is the same call, not a second action.
4. The offering belongs to this section's own grade and year — the same re-check, and the same reasoning, as `setSubjectTeacher` in `src/lib/registry/assignments.ts:53`: nothing in the schema stops a Class 9 offering being attached to a Class 5 section.
5. A `TeacherAssignment` exists for (section, offering) — else *"No teacher is assigned to Science for Class 5 A yet. Assign one on the Teaching page first."*
6. That teacher is free — else `TimetableClashError`: *"R. Sharma already teaches Class 6 B in this period."*
7. Then, in one transaction: `deleteMany` on `{ sectionId, dayOfWeek, schoolPeriodId }` — by section, because the cell may currently hold a *different* subject and so a different assignment id — followed by the `create`.

### 5.4 `teacher-week.ts`

```ts
export function getTeacherWeek(staffId: number, academicYearId: number): Promise<WeekPeriod[]>;
export function listTeacherClashes(academicYearId: number): Promise<Clash[]>;
```

`listTeacherClashes` groups lessons by (staff, day, period) and returns those with more than one. `setTimetableCell` cannot create a clash, but **`setSubjectTeacher` can**: moving Class 5 A's Maths to a teacher who is already busy in that slot double-books them retroactively.

*Corrected during implementation.* As written, `setSubjectTeacher` did not create a clash — it deleted the section's lessons. It replaced the `TeacherAssignment` row (delete, then create), and `TimetablePeriod` cascades from that row, so changing who teaches a subject silently destroyed every lesson already scheduled for it. The clash test in `teacher-week.integration.test.ts` found this by expecting one clash and getting zero. `setSubjectTeacher` now **moves** the assignment — it updates `staffId` on the existing row — so lessons survive a reassignment and the clash this section describes becomes reachable, which is what the audit is for. Blocking registry edits from the Teaching page is out of scope, so the clash is reported instead — a `--warn` banner in the toolbar, with the count and a link to the affected cells. Colour is never the only signal (§10 of the Option C spec): the banner carries the word and an icon.

### 5.5 Change to `src/lib/dashboard/teacher-schedule.ts`

The `select` joins `schoolPeriod` for `name`, `startMinute` and `endMinute` instead of reading columns that no longer exist; `orderBy` becomes `{ schoolPeriod: { order: "asc" } }`. `TodayPeriod` gains `periodName`, so the Overview panel can say "Period 3" beside the clock time. `schoolTime`, `formatMinute` and `periodIsCurrent` are untouched, and so are their unit tests.

## 6. Page contract

One new row in §6 of the Option C spec:

| Route | Tabs | Body | Aside |
|---|---|---|---|
| `/dashboard/timetable` | sections | week grid | selected-cell editor |

Selection deep-links as `?section=<id>` through `router.replace`, matching the `?student=` / `?staff=` convention established in Phase 2a, so the grid is server-rendered rather than assembled from client state.

## 7. UI

### 7.1 Route

```
src/app/dashboard/timetable/
  page.tsx        server: requirePage, loads the year, bell, working days,
                  sections + filled counts, grid, clashes; reads ?section=
  loading.tsx     skeleton mirroring the PageFrame shape (§8.3)
  actions.ts      setCell, saveBell, saveWorkingDays
  _components/
    timetable-workspace.tsx   client shell — tabs, segmented view, aside
    timetable-view.tsx        presentational grid + teacher week
    timetable-forms.tsx       the School-day editor
```

The three-file `workspace` / `view` / `forms` split is the one `classes/_components/` already uses.

Every action starts with `await requireCapability("manage:timetable")` — they are public HTTP endpoints, so the check lives there and not in the page — then revalidates `/dashboard/timetable` and `/dashboard`, because the Overview panel reads the same rows.

### 7.2 Composition

`PageFrame` with `eyebrow="Timetable"`, the section name as `title` and the BS year as `meta`:

- **`PageFrame.Tabs`** → `RegisterTabs`, one tab per section, `code` from `shortGrade(grade.name) + section.name` ("5A"), `count` = scheduled lessons, `empty` when zero. `baseId` / `panelId` wired through `registerTabId` so the body is a real `tabpanel`.
- **`PageFrame.Toolbar`** → the `Segmented` view switch (**Week · By teacher · School day**), the clash banner when `listTeacherClashes` returns anything, and a filled-of-total count.
- **`PageFrame.Split`** → the grid as `children`, the selected-cell editor as `aside`. Below the `split` breakpoint `PageFrame` turns the aside into a right `Sheet` on its own; the page does not handle that itself.

Note the real `PageFrame` API is `Tabs` / `Toolbar` / `Split` / `Body`; the aside is a prop of `Split`, not the `PageFrame.Aside` named in §6 of the Option C spec.

### 7.3 The grid

**Not a `DataTable`.** Days × periods is a matrix, not a sortable row list, so it is a semantic table with `role="grid"`, `aria-rowcount` / `aria-colcount` and `scope`d headers — following `ef64414 fix(ui): grid roles and DOM-safe tab ids` rather than bending TanStack around a shape it does not model. `DataTable` is still used, for the By-teacher list.

Rows are bell periods (break rows spanning the full width as a labelled divider), columns are working days. Each lesson cell holds a `FieldSelect` of the section's offerings; `SelectOption` already supports `disabled`, so a booked teacher's subject stays visible and disabled with the reason folded into its label — *"Maths — B. Thapa is in 5B"* — instead of vanishing. A refused choice that says why is the pattern from `4e0ce80`.

Writes go through `useToastedActionState`, and the select is controlled so a revalidation cannot fight an uncontrolled initial value — the comment already carried by `classes-workspace.tsx:73` and `teaching-workspace.tsx`.

The aside shows the selected cell: day, period, subject, teacher, a room field, a Clear button, and any clash explanation in full.

### 7.4 Empty states

`EmptyState` handles the two orders-of-operation gaps, each with one action:

- No bell schedule → *"Set the school day before building a timetable"*, action switching to the School-day segment. A "Use a standard day" button seeds `DEFAULT_BELL` into the form.
- No current academic year → the same message the Assignments page already gives.

### 7.5 Rail

`nav-model.ts`: a `{ id: "timetable", label: "Timetable", href: "/dashboard/timetable", icon: CalendarRange }` item joins the second group — Classes · Subjects · Teaching · Timetable — which is the group already named `timetable` at `nav-model.ts:26`. Not added to `MOBILE_IDS`; it reaches phones through the account menu, like the rest of that group.

### 7.6 Tokens and motion

No raw colour classes. Clashes use `--warn` / `--warn-tint`, the current period uses `--brand-tint`, both paired with a word or icon. Cell updates animate through `motion/react` gated on `useReducedMotion()`; nothing loops.

## 8. Seed

`scripts/seed.cjs` gains two steps, both idempotent and both following the existing `--reassign` convention with a `--reschedule` flag:

- **`seedBell()`** — inserts `DEFAULT_BELL` when `SchoolPeriod` is empty.
- **`seedTimetable()`** — fills each section's week. For every section × working day × teaching period, it picks an offering that still has weekly budget left and whose teacher is free in that slot, leaving the cell empty when nothing fits rather than forcing a clash. Budget is the section's total slots divided across its offerings, so Nepali does not land eleven periods while Science gets one — the same reasoning as the existing load-balancing in `seedTeaching`.

Without this the dashboard panel stays empty after the feature ships, which is the symptom that prompted the work.

## 9. Accessibility

Beyond the Option C floor (§10):

- The grid is `role="grid"` with row and column counts; day headers are `<th scope="col">`, period headers `<th scope="row">`.
- Each cell select carries an `aria-label` naming its coordinates in full — "Sunday, Period 1, Class 5 A" — because the visible label is only the subject.
- Disabled options state the reason in their own text, since a disabled state alone is not announced usefully.
- The clash banner is `role="status"`, and its count is part of the accessible name, not a bare colour change.
- Break rows are a real text label with decorative rules around it, never an empty row.

## 10. Testing

Following §11 of the Option C spec — unit tests pure, DB tests behind `DB_TESTS=1`, existing tests never skipped or deleted.

- **Unit** — `bell.test.ts`: contiguity, overlap, ordering, `start < end`, duplicate names, and `DEFAULT_BELL` passing its own validator. `teacher-schedule.test.ts` is unchanged and must stay green.
- **Integration** — `cells.integration.test.ts`: each of the seven rules in §5.3, including the clash message naming the other section and the replace-in-place behaviour when a filled cell changes subject. `grid.integration.test.ts`: offerings with no teacher surface as `staffId: null`; counts match. `teacher-week.integration.test.ts`: `listTeacherClashes` finds a clash created through `setSubjectTeacher`, which is the path that can actually produce one.
- **Existing** — `teacher-schedule.integration.test.ts` is rewritten to build its rows through `setTimetableCell` and a seeded bell instead of a raw `createMany`, so it exercises the write path it currently bypasses.
- **Gates** — `npm run lint`, `tsc --noEmit`, `next build` pass at the end of every step; the smoke script covers `/dashboard/timetable` at 1440 / 1000 / 390 px in both themes.

## 11. Implementation order

Each step leaves the app working and the suite green.

1. Migration + schema: `SchoolPeriod`, the `TimetablePeriod` alterations, `SchoolProfile.workingDays`. Update `teacher-schedule.ts` and its integration test to the new join. **Nothing user-visible; existing tests green.**
2. `manage:timetable` in `roles.ts` plus the `ROUTE_CAPABILITY` entry. The settings matrix and rail pick it up; the route 404s until step 4.
3. `bell.ts` with `validateBell` unit tests, then `grid.ts`, `cells.ts`, `teacher-week.ts` with their integration tests. TDD — tests first.
4. The route: `page.tsx`, `actions.ts`, `loading.tsx`, and the workspace with tabs plus the Week grid only.
5. School-day segment, including the destructive-edit confirmation from §3.4.
6. By-teacher segment and the clash banner.
7. `seedBell` / `seedTimetable` in `scripts/seed.cjs`.
8. Overview panel shows `periodName`; smoke screenshots at three widths in both themes.

## 12. Deviations from the Option C spec

- **§9 "No schema or migration changes"** does not hold here. That constraint scoped the redesign, whose job was to move UI onto a contract without touching data. This is a feature, and it needs `SchoolPeriod`, the `TimetablePeriod` alteration and `SchoolProfile.workingDays`. Recorded rather than quietly broken.
- **§6 names `PageFrame.Aside`**; the built component exposes the aside as a prop of `PageFrame.Split`. This spec follows the code.
- **§6's body is a `DataTable` on every data route.** The week grid is a `role="grid"` matrix instead, for the reason in §7.3. The By-teacher view is a second read-only grid rather than a `DataTable`, because a teacher's week is the same matrix seen down the other axis and two different shapes for one thing would read as two features.

## 13. Learned during implementation

- **§5.1's module is two modules.** `bell.ts` imports Prisma, and the grid, the School-day form and the validator all run in the browser — importing it from a client component pulls `node:module` into the browser bundle, which `next build` rejects outright (`the chunking context does not support external modules`). The pure half — types, `DAY_NAMES`, `DEFAULT_WORKING_DAYS`, `DEFAULT_BELL`, `validateBell`, `BellScheduleError` — now lives in `src/lib/timetable/schedule.ts`, and `bell.ts` holds only queries. Type-only imports were never the problem; value imports were.
- **`countLessonsIn(ids)` became `countLessonsByPeriod()`**, returning a map. The School-day form needs a count per row to name in its confirmation, not a total.
- **`listBookings(yearId, exceptSectionId)`** was added to `grid.ts`. §7.3 says a booked teacher's subject is greyed with the reason, which needs to know where every teacher is across the whole school — the section's own grid cannot answer that.
- **The seed leaves gaps on purpose.** Against the current seeded school it places 378 lessons and leaves 210 slots free: the teaching assignments spread each teacher across several sections, so at some hours nobody is available. Leaving the cell empty is right — the alternative is a double-booking the write path would refuse anyway.
- **`TodayPeriod.room` can be blank now**, so the Overview panel renders the map pin only when a room was recorded.

## 14. Grid readability pass

The first working grid was correct and hard to read: forty-eight selects meant the dominant texture was chevrons and borders, and the subjects — the actual content — were the quietest thing on the screen.

- **Cells rest as chips.** The control is still a real `<select>`; only its resting skin changes — borderless, chevron revealed on hover, focus or open. Nothing is lost for the keyboard or a screen reader, and the grid reads as a document rather than a form, which matches how often a timetable is read versus edited.
- **Subject colour**, as a 3px left rule, from eight `--subject-N` tokens defined for both themes. Never the only signal: the subject's name is always set beside it.
- **Tones are ranked, not hashed.** The first attempt hashed the subject's name (FNV-1a with a murmur finaliser). It passed a spread test and was still wrong in practice — English, Nepali, Computer and Moral Education all landed on one tone, and English and Nepali sit side by side in every class. Tones now come from the subject's rank in the school's own list, ordered by **id** rather than by name, so the first eight subjects cannot collide and adding a subject appends a colour instead of shifting every existing one. `toneForRank` is pure and tested; `subjectTones()` in `grid.ts` builds the map, and the tone travels in `GridCell`, `GridOption` and `WeekPeriod` rather than being recomputed in the browser.
- **An empty slot reads as a gap** — a dash at rest, a `+` on hover — instead of a bordered control saying "— free —".
- **The school's clock is live.** `useSchoolNow()` ticks every 30s off `schoolTime()`, which moved into `schedule.ts` for exactly the client/server reason in §13. Today's column is tinted and labelled "today", the current period carries a **Now** pill, and a 2px rule tracks how far through the lesson the school actually is. Null until after mount: the server has no business rendering "now".
- **Motion**, all through `motion/react` and all gated on `useReducedMotion()`: rows rise 4px with a 20ms stagger capped at 12 (the Option C table-row spec, applied to grid rows), the view switch cross-fades at 160ms, the fill meter eases, and a written cell flashes and settles so the write confirms itself where the eye already is rather than only in the toast.
- **Two defects fixed.** The page title said the class name on every view, including School day; and the aside opened on cell *focus*, so opening a select on a narrow screen slid a Sheet out underneath it. The pane now opens from its own small button in the cell.
