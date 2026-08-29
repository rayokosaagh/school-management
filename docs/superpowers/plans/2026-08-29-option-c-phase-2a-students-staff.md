# Option C redesign — Phase 2a: Students and Staff on the page contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Students page (the reference page) and the Staff page on the Phase 1 primitives — register tab strip, sortable/paginated `DataTable`, split-view `DetailPane` — remove the `/students/[id]` and `/teachers/[id]` routes in favour of `?student=` / `?staff=` deep links, and add the summary data functions those panes need.

**Architecture:** Each page is a server component that loads the list rows and, when the URL carries `?student=<id>` (`?staff=<id>`), that one record's summary; a single client "workspace" component renders tabs + toolbar + table + pane. Selecting a row is a `router.replace` of the search param, so the pane is always server-rendered from fresh data (no client fetching, no new read actions); the row highlights immediately and the pane shows a skeleton until the new prop arrives. Existing forms (`AddStudentForm`, `StudentDetail`, `AddStaffForm`, `StaffDetail`, photo forms) and every server action keep their signatures; only where they render changes.

**Tech Stack:** Next.js 16 App Router (async `searchParams`), React 19, Tailwind 4 tokens, Phase 1 primitives (`src/components/ui/{page-frame,register-tabs,data-table,detail-pane,empty-state,status-dot,attendance-strip}.tsx`), shadcn `sheet`/`skeleton`, Prisma 6, Vitest 4 (DB suites behind `DB_TESTS=1`, `fileParallelism: false`).

**Spec:** `docs/superpowers/specs/2026-08-29-option-c-redesign-design.md` §6 (page contract rows for Students/Staff, detail routes, add forms, empty states), §7.2, §9 (`getStudentSummary`, `getStaffSummary`), §10, §12 steps 4–5. **Phase 1 contracts** at the end of `docs/superpowers/plans/2026-08-29-option-c-phase-1-foundation-shell.md` ("Phase 1 outcome") bind every page here.

## Global Constraints

- Project root `D:\Project\Web-Project\SchoolMgmnt\school-management` (POSIX `/d/Project/Web-Project/SchoolMgmnt/school-management`), branch `redesign/phase-2`.
- Gates after every task: `npx tsc --noEmit -p tsconfig.json`, `npx eslint .` (0 errors; the one `react-hooks/incompatible-library` warning on `useReactTable` is known), `npx vitest run`; `DB_TESTS=1 npx vitest run` and `npx next build` at the end of Tasks 1, 3, 4, 5. Existing 219 tests stay green; never skip or delete one.
- No Prisma schema changes. No server-action signature changes (`addStudent`, `editStudent`, `removeStudent`, `moveStudentSection`, `saveGuardian`, `removeGuardian`, `saveStudentPhoto`, `addStaff`, `toggleStaffActive`, `assignClassTeacher`, `editStaff`, `removeStaff`, `saveStaffPhoto` keep `(prev, formData) => Promise<State>`).
- Phase 1 contracts: `<main>` scrolls; `PageFrame` is `h-full`; `PageFrame.Body` is `flex-col overflow-hidden` with no scroll fallback (a `DataTable` inside it scrolls itself); `PageFrame.Split` chooses inline aside vs Sheet by `useMediaQuery`; tabs↔panel a11y via `baseId`/`panelId`/`registerTabId`; theme through `applyTheme`/`useTheme`.
- Colours only through tokens (`bg-brand*`, `text-ink*`, `bg-ok/warn/bad(-tint)`, `border-line`, …). Status never colour-only. Every icon-only button has `aria-label`. Animations gated on `useReducedMotion()`.
- Breakpoints `shell:`/`split:` only — never `md:`/`lg:` for shell decisions.
- Copy: sentence case, active verbs; a button's label matches its toast ("Admit student" → "Student admitted."). Existing action success strings are kept.
- Commit after every task; messages are Conventional Commits ending with `Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz`.
- A `next dev` server may be running on :3000; never start a second one.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/attendance/strip.ts` (+ `.test.ts`) | pure: zip a student's calendar records against a day list → `DayStatus[]`; percent helper |
| `src/lib/attendance/attendance.ts` | + `recentStudentStrips(academicYearId, end, count)` → per-student `DayStatus[]` for table rows |
| `src/lib/registry/students.ts` | + `getStudentSummary(studentId, academicYearId, today)` |
| `src/lib/registry/staff.ts` | + `getStaffSummary(staffId, academicYearId)` |
| `src/lib/registry/summaries.integration.test.ts` | DB tests for the three functions above |
| `src/components/ui/attendance-strip.tsx` | absent/late/none bars get a shape, not just a colour |
| `src/app/dashboard/students/page.tsx` | server: rows, sections, strips, optional summary from `?student=` |
| `src/app/dashboard/students/actions.ts` | + `saveStudentPhoto` (moved from `[id]/actions.ts`) |
| `src/app/dashboard/students/_components/students-workspace.tsx` | client: tabs + toolbar + DataTable + pane wiring, `?student=` sync |
| `src/app/dashboard/students/_components/student-pane.tsx` | client: `DetailPane` for one student (view + edit + photo) |
| `src/app/dashboard/students/_components/photo-form.tsx` | moved from `[id]/_components/` |
| `src/app/dashboard/students/_components/student-detail.tsx` | unchanged editor, now rendered inside the pane |
| `src/app/dashboard/students/_components/student-form.tsx` | unchanged admit form, now inside a `Sheet` |
| deleted | `students/[id]/**`, `students/_components/students-view.tsx`, `students/_components/students-by-section.tsx` |
| `src/app/dashboard/teachers/page.tsx` | server: rows, optional summary from `?staff=` |
| `src/app/dashboard/teachers/actions.ts` | + `saveStaffPhoto` (moved) |
| `src/app/dashboard/teachers/_components/staff-workspace.tsx` | client workspace |
| `src/app/dashboard/teachers/_components/staff-pane.tsx` | client pane |
| `src/app/dashboard/teachers/_components/staff-detail.tsx` | `StaffDetail` + `StaffRow` moved out of `teachers-view.tsx` |
| `src/app/dashboard/teachers/_components/photo-form.tsx` | moved from `[id]/_components/` |
| deleted | `teachers/[id]/**`, `teachers/_components/teachers-view.tsx`, `teachers/_components/staff-by-role.tsx` |
| `src/app/dashboard/students/loading.tsx`, `teachers/loading.tsx` | route skeletons mirroring the PageFrame shape |

---

### Task 1: Summary data — strip helper, `recentStudentStrips`, `getStudentSummary`, `getStaffSummary`

**Files:**
- Create: `src/lib/attendance/strip.ts`, `src/lib/attendance/strip.test.ts`
- Modify: `src/lib/attendance/attendance.ts` (append), `src/lib/registry/students.ts` (append), `src/lib/registry/staff.ts` (append)
- Create: `src/lib/registry/summaries.integration.test.ts`

**Interfaces:**
- Consumes: `studentCalendar(studentId, from, to)` → `{date, status, note}[]` (`attendance.ts:274`); `recentDays(end, count)` (`overview.ts:31`); `getStudent(id)` (`students.ts:107`, includes `guardians`, `enrollments` with `section.grade` + `academicYear`); `getStudentMarksheets(studentId)` (`exams.ts:317`) → `{ enrolment, sheets: { term, offerings, result, classSize }[] } | null`; `getStaffDetail(id)` (`staff.ts:89`); `DayStatus` from `@/components/ui/attendance-strip`.
- Produces:
  ```ts
  // strip.ts
  export function stripFromCalendar(records: { date: Date; status: string }[], days: Date[]): DayStatus[]
  export function attendancePercent(records: { status: string }[]): number | null   // (present+late)/total, rounded; null when no records
  // attendance.ts
  export async function recentStudentStrips(academicYearId: number, end: Date, count: number): Promise<Map<number, DayStatus[]>>
  // students.ts
  export type StudentSummary = { studentId; admissionNo; fullName; fullNameNp; photoId; gender; status; address; dobBs; dobAd; admittedOnBs;
    enrollment: { sectionId; sectionLabel; rollNo } | null;
    guardians: { id; relation; fullName; phone; occupation; isPrimary }[];
    attendance: { percent: number | null; recorded: number; days: DayStatus[] };
    exams: { termId; name; isPublished; percent: number | null; gpa: number | null }[];
    history: { year: string; sectionLabel: string; rollNo: number; enrolledOnBs: string }[] };
  export async function getStudentSummary(studentId: number, academicYearId: number, today: Date): Promise<StudentSummary | null>
  // staff.ts
  export type StaffSummary = { staffId; fullName; fullNameNp; photoId; phone; designation; joinedOnBs; isActive;
    account: { username: string; email: string | null } | null;
    sectionsLed: { id; label; year: string }[];
    load: { year: string; items: { section: string; subject: string }[] }[];
    rollCallsTaken: number };
  export async function getStaffSummary(staffId: number, academicYearId: number): Promise<StaffSummary | null>
  ```

- [ ] **Step 1: Write the failing unit test** — `src/lib/attendance/strip.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { attendancePercent, stripFromCalendar } from "./strip";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("stripFromCalendar", () => {
  it("maps each requested day to the record's status, oldest first, 'none' when there is no record", () => {
    const days = [d("2083-05-10"), d("2083-05-11"), d("2083-05-12"), d("2083-05-13")];
    const records = [
      { date: d("2083-05-10"), status: "PRESENT" },
      { date: d("2083-05-12"), status: "LATE" },
      { date: d("2083-05-13"), status: "ABSENT" },
    ];
    expect(stripFromCalendar(records, days)).toEqual(["present", "none", "late", "absent"]);
  });
  it("treats LEAVE as absent for the strip and ignores records outside the window", () => {
    const days = [d("2083-05-10")];
    expect(stripFromCalendar([{ date: d("2083-05-10"), status: "LEAVE" }, { date: d("2083-05-09"), status: "PRESENT" }], days)).toEqual(["absent"]);
  });
  it("returns an empty strip for no days", () => {
    expect(stripFromCalendar([], [])).toEqual([]);
  });
});

describe("attendancePercent", () => {
  it("counts present and late as attended, rounded", () => {
    expect(attendancePercent([{ status: "PRESENT" }, { status: "LATE" }, { status: "ABSENT" }])).toBe(67);
  });
  it("is null with no records", () => {
    expect(attendancePercent([])).toBeNull();
  });
});

describe("lastDays", () => {
  it("returns `count` UTC-midnight dates ending on `end`, oldest first", () => {
    const days = lastDays(new Date("2083-05-13T10:30:00.000Z"), 3);
    expect(days.map((x) => x.toISOString())).toEqual([
      "2083-05-11T00:00:00.000Z",
      "2083-05-12T00:00:00.000Z",
      "2083-05-13T00:00:00.000Z",
    ]);
  });
});
```

(Import `lastDays` alongside the other two.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/attendance/strip`
Expected: FAIL — cannot find module `./strip`.

- [ ] **Step 3: Create `src/lib/attendance/strip.ts`**

```ts
import type { DayStatus } from "@/components/ui/attendance-strip";

const STATUS_TO_DAY: Record<string, DayStatus> = {
  PRESENT: "present",
  LATE: "late",
  ABSENT: "absent",
  LEAVE: "absent",
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/// One entry per requested day, oldest first. Days the student has no record
/// for read as "none" — the section may not have taken roll that day.
export function stripFromCalendar(records: { date: Date; status: string }[], days: Date[]): DayStatus[] {
  const byDay = new Map(records.map((r) => [dayKey(r.date), STATUS_TO_DAY[r.status] ?? "none"]));
  return days.map((day) => byDay.get(dayKey(day)) ?? "none");
}

/// Present and late both count as attended, matching monthlyRegister.
export function attendancePercent(records: { status: string }[]): number | null {
  if (records.length === 0) return null;
  const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  return Math.round((attended / records.length) * 100);
}

/// `count` UTC-midnight dates ending on `end`'s day, oldest first — the same
/// shape as AttendanceSession.date, so the list can be used in a `date: { in }`.
/// Lives here rather than in dashboard/overview to keep attendance free of a
/// circular import (overview already imports attendance).
export function lastDays(end: Date, count: number): Date[] {
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: count }, (_, i) => new Date(last - (count - 1 - i) * 86_400_000));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/attendance/strip`
Expected: 6 passed.

- [ ] **Step 5: Append `recentStudentStrips` to `src/lib/attendance/attendance.ts`**

Add imports at the top: `import { lastDays, stripFromCalendar } from "./strip";` and `import type { DayStatus } from "@/components/ui/attendance-strip";`. **Do not import from `@/lib/dashboard/overview`** — it imports this file. Append:

```ts
/// Per-student strips for a table: the last `count` days ending at `end`,
/// built from one query over the year's sessions in that window.
export async function recentStudentStrips(
  academicYearId: number,
  end: Date,
  count: number,
): Promise<Map<number, DayStatus[]>> {
  const days = lastDays(end, count);
  const records = await prisma.attendanceRecord.findMany({
    where: { session: { academicYearId, date: { in: days } } },
    select: { studentId: true, status: true, session: { select: { date: true } } },
  });
  const byStudent = new Map<number, { date: Date; status: string }[]>();
  for (const r of records) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push({ date: r.session.date, status: r.status });
    byStudent.set(r.studentId, list);
  }
  const strips = new Map<number, DayStatus[]>();
  for (const [studentId, list] of byStudent) strips.set(studentId, stripFromCalendar(list, days));
  return strips;
}
```

`lastDays` returns UTC-midnight dates, which match `AttendanceSession.date` (`@db.Date`), exactly like `recentDays` in `overview.ts:30-40`.

- [ ] **Step 6: Append `getStudentSummary` to `src/lib/registry/students.ts`**

Add imports: `import { studentCalendar } from "@/lib/attendance/attendance";`, `import { attendancePercent, lastDays, stripFromCalendar } from "@/lib/attendance/strip";`, `import { getStudentMarksheets } from "@/lib/assessment/exams";`, `import { formatBs, toBsInput } from "@/lib/date/bs";`, `import type { DayStatus } from "@/components/ui/attendance-strip";`. Append:

```ts
export type StudentSummary = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  gender: string;
  status: string;
  address: string | null;
  dobBs: string;
  dobAd: string;
  admittedOnBs: string;
  enrollment: { sectionId: number; sectionLabel: string; rollNo: number } | null;
  guardians: { id: number; relation: string; fullName: string; phone: string; occupation: string | null; isPrimary: boolean }[];
  attendance: { percent: number | null; recorded: number; days: DayStatus[] };
  exams: { termId: number; name: string; isPublished: boolean; percent: number | null; gpa: number | null }[];
  history: { year: string; sectionLabel: string; rollNo: number; enrolledOnBs: string }[];
};

/// Everything the detail pane shows for one student, in one call. Attendance
/// is over the given academic year; exams come from the current-year ledgers.
export async function getStudentSummary(
  studentId: number,
  academicYearId: number,
  today: Date,
): Promise<StudentSummary | null> {
  const student = await getStudent(studentId);
  if (!student) return null;

  const current = student.enrollments.find((e) => e.academicYearId === academicYearId) ?? null;
  const year = current?.academicYear ?? null;

  const [records, sheets] = await Promise.all([
    year ? studentCalendar(studentId, year.startsOn, year.endsOn) : Promise.resolve([]),
    getStudentMarksheets(studentId),
  ]);

  const days = lastDays(today, 14);
  const label = (e: { section: { name: string; grade: { name: string } } }) => `${e.section.grade.name} ${e.section.name}`;

  return {
    studentId: student.id,
    admissionNo: student.admissionNo,
    fullName: student.fullName,
    fullNameNp: student.fullNameNp,
    photoId: student.photoId,
    gender: student.gender,
    status: student.status,
    address: student.address,
    dobBs: toBsInput(student.dob),
    dobAd: student.dob.toISOString().slice(0, 10),
    admittedOnBs: toBsInput(student.admittedOn),
    enrollment: current ? { sectionId: current.sectionId, sectionLabel: label(current), rollNo: current.rollNo } : null,
    guardians: student.guardians.map((g) => ({
      id: g.id, relation: g.relation, fullName: g.fullName, phone: g.phone, occupation: g.occupation, isPrimary: g.isPrimary,
    })),
    attendance: {
      percent: attendancePercent(records),
      recorded: records.length,
      days: stripFromCalendar(records, days),
    },
    exams: (sheets?.sheets ?? []).map((s) => ({
      termId: s.term.id,
      name: s.term.name,
      isPublished: s.term.isPublished,
      percent: s.result.overall.percent,
      gpa: s.result.overall.gpa,
    })),
    history: student.enrollments.map((e) => ({
      year: e.academicYear.nameBS,
      sectionLabel: label(e),
      rollNo: e.rollNo,
      enrolledOnBs: formatBs(e.enrolledOn, "YYYY-MM-DD"),
    })),
  };
}
```

Before relying on `s.result.overall`, read `getStudentMarksheets` at `src/lib/assessment/exams.ts:317-345` and `getStudentResult` at `:303`: `sheets[].result` is the student's ledger row (`{ studentId, fullName, rollNo, subjects, overall, grandTotal, position }`), so `result.overall.percent`/`.gpa` are the fields. If the row is nested one level deeper (e.g. `result.student.overall`), use that path and say so in the report.

- [ ] **Step 7: Append `getStaffSummary` to `src/lib/registry/staff.ts`**

Add import `import { toBsInput } from "@/lib/date/bs";`. Append:

```ts
export type StaffSummary = {
  staffId: number;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  phone: string;
  designation: string;
  joinedOnBs: string;
  isActive: boolean;
  account: { username: string; email: string | null } | null;
  sectionsLed: { id: number; label: string; year: string }[];
  load: { year: string; items: { section: string; subject: string }[] }[];
  rollCallsTaken: number;
};

/// The staff detail pane in one call; teaching load is grouped by year with
/// the given academic year first.
export async function getStaffSummary(staffId: number, academicYearId: number): Promise<StaffSummary | null> {
  const staff = await getStaffDetail(staffId);
  if (!staff) return null;

  const byYear = new Map<string, { section: string; subject: string }[]>();
  const years: { id: number; nameBS: string }[] = [];
  for (const a of staff.assignments) {
    const y = a.section.academicYear;
    if (!byYear.has(y.nameBS)) {
      byYear.set(y.nameBS, []);
      years.push({ id: y.id, nameBS: y.nameBS });
    }
    byYear.get(y.nameBS)!.push({
      section: `${a.section.grade.name} ${a.section.name}`,
      subject: a.subjectOffering.subject.name,
    });
  }
  years.sort((a, b) => (a.id === academicYearId ? -1 : b.id === academicYearId ? 1 : b.nameBS.localeCompare(a.nameBS)));

  return {
    staffId: staff.id,
    fullName: staff.fullName,
    fullNameNp: staff.fullNameNp,
    photoId: staff.photoId,
    phone: staff.phone,
    designation: staff.designation,
    joinedOnBs: toBsInput(staff.joinedOn),
    isActive: staff.isActive,
    account: staff.user ? { username: staff.user.username, email: staff.user.email ?? null } : null,
    sectionsLed: staff.sectionsLed.map((s) => ({
      id: s.id, label: `${s.grade.name} ${s.name}`, year: s.academicYear.nameBS,
    })),
    load: years.map((y) => ({ year: y.nameBS, items: byYear.get(y.nameBS) ?? [] })),
    rollCallsTaken: staff._count.attendanceKept,
  };
}
```

Check `getStaffDetail`'s include at `staff.ts:89-110` for the exact nested names (`assignments.section.academicYear`, `assignments.subjectOffering.subject`, `sectionsLed.grade`, `sectionsLed.academicYear`, `user.email`); adjust only if a name differs and say so.

- [ ] **Step 8: Write the DB integration test** — `src/lib/registry/summaries.integration.test.ts`

Copy the fixture pattern from `src/lib/attendance/attendance.integration.test.ts:24-105` **verbatim** (its `made` object, `beforeAll` that creates a year, a grade, two sections, students, and saves one sheet; its `afterAll` deletion order), changing every name prefix from `__att` to `__sum`. Then add:

```ts
describe.skipIf(!process.env.DB_TESTS)("summaries", () => {
  it("recentStudentStrips returns a strip per student with a record in the window", async () => {
    const strips = await recentStudentStrips(made.yearId, made.sheetDate, 14);
    const strip = strips.get(made.studentIds[0]);
    expect(strip).toHaveLength(14);
    expect(strip![13]).toBe("present"); // the sheet saved in beforeAll marks this student present on sheetDate
    expect(strip!.slice(0, 13).every((d) => d === "none")).toBe(true);
  });

  it("getStudentSummary composes record, enrolment, attendance and history", async () => {
    const s = await getStudentSummary(made.studentIds[0], made.yearId, made.sheetDate);
    expect(s).not.toBeNull();
    expect(s!.enrollment?.sectionId).toBe(made.sectionIds[0]);
    expect(s!.attendance.recorded).toBe(1);
    expect(s!.attendance.percent).toBe(100);
    expect(s!.attendance.days).toHaveLength(14);
    expect(s!.history).toHaveLength(1);
    expect(s!.exams).toEqual([]);
  });

  it("getStudentSummary is null for an unknown student", async () => {
    expect(await getStudentSummary(-1, made.yearId, made.sheetDate)).toBeNull();
  });

  it("getStaffSummary reports sections led and an empty load for a fresh staff member", async () => {
    const staff = await createStaff({ firstName: "Sum", lastName: "Teacher", phone: "9800000099", designation: "Teacher", joinedOn: new Date() });
    made.staffId = staff.id;
    await setClassTeacher(made.sectionIds[0], staff.id);
    const s = await getStaffSummary(staff.id, made.yearId);
    expect(s?.sectionsLed.map((x) => x.id)).toEqual([made.sectionIds[0]]);
    expect(s?.load).toEqual([]);
    expect(s?.rollCallsTaken).toBe(0);
    expect(s?.account).toBeNull();
  });
});
```

Use the fixture's actual field names for `made.yearId`, `made.sectionIds`, `made.studentIds`, `made.sheetDate` (rename to whatever the copied fixture uses; if it has no `sheetDate`, add `sheetDate: Date` set to the date passed to `saveSheet`). In `afterAll`, before deleting sections, add `if (made.staffId) { await prisma.section.updateMany({ where: { classTeacherId: made.staffId }, data: { classTeacherId: null } }); await prisma.staff.delete({ where: { id: made.staffId } }); }`. Imports: `recentStudentStrips` from `@/lib/attendance/attendance`, `getStudentSummary` from `@/lib/registry/students`, `getStaffSummary`, `createStaff` from `@/lib/registry/staff`, `setClassTeacher` from `@/lib/registry/structure`, `prisma` from `@/lib/prisma`.

- [ ] **Step 9: Run the DB suite and gates**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/summaries.integration.test.ts` → 4 passed. Then `npx tsc --noEmit -p tsconfig.json && npx eslint . && npx vitest run && DB_TESTS=1 npx vitest run` → all green (223+).

- [ ] **Step 10: Commit**

```bash
git add src/lib/attendance/strip.ts src/lib/attendance/strip.test.ts src/lib/attendance/attendance.ts src/lib/registry/students.ts src/lib/registry/staff.ts src/lib/registry/summaries.integration.test.ts
git commit -m "feat(registry): student and staff summaries, per-student attendance strips

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 2: `AttendanceStrip` bars carry a shape, not just a colour

**Files:**
- Modify: `src/components/ui/attendance-strip.tsx`

**Interfaces:** props unchanged (`days`, `percent?`, `size?`, `className?`).

- [ ] **Step 1: Replace the bar rendering**

In `AttendanceStrip`, replace the `days.map(...)` block with:

```tsx
      {days.map((d, i) => (
        <i
          key={i}
          aria-hidden="true"
          className={cn(
            "rounded-[2px]",
            size === "sm" ? "h-3.5 w-1.5" : "h-5.5 w-full flex-1",
            d === "present" && "bg-ok opacity-85",
            // Absent: hollow — reads as a gap even without colour.
            d === "absent" && "border-bad border-2 bg-transparent",
            // Late: half-height bar.
            d === "late" && "bg-warn self-end opacity-85 [height:50%]",
            // Not taken: faint dotted outline.
            d === "none" && "border-line border border-dashed bg-transparent",
          )}
        />
      ))}
```

and delete the now-unused `TONE` map. Add `items-end` is NOT needed — the root already uses `inline-flex items-center`; change it to `items-end` so late bars sit on the baseline.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src && npx vitest run src/components/ui/attendance-strip` → pass (the `describeStrip` test is unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/attendance-strip.tsx
git commit -m "fix(ui): AttendanceStrip encodes status by shape as well as colour

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 3: Students page on the page contract

**Files:**
- Modify: `src/app/dashboard/students/page.tsx` (rewrite)
- Modify: `src/app/dashboard/students/actions.ts` (append `saveStudentPhoto`)
- Create: `src/app/dashboard/students/_components/students-workspace.tsx`, `student-pane.tsx`, `photo-form.tsx`, `src/app/dashboard/students/loading.tsx`
- Modify: `src/app/dashboard/students/_components/student-detail.tsx` (only: remove any `Link` to `/dashboard/students/[id]` if present — the map shows none; keep as-is otherwise)
- Delete: `src/app/dashboard/students/[id]/` (whole folder), `_components/students-view.tsx`, `_components/students-by-section.tsx`

**Interfaces:**
- Consumes: Task 1 (`getStudentSummary`, `StudentSummary`, `recentStudentStrips`), `listEnrolledStudents`, `listSections`, `suggestAdmissionNo`, `getCurrentAcademicYear`, `requirePage`; `AddStudentForm` props `{ sections, academicYearId, suggestedAdmissionNo }`; `StudentDetail` props `{ data: StudentDetailData, sections, academicYearId, onDone }` and its exported `StudentDetailData`; `removeStudent` action; `useToastedActionState`; Phase 1 primitives.
- Produces: `StudentRow` (moved here), `<StudentsWorkspace>` props below, `saveStudentPhoto` in `students/actions.ts` with the same signature as before.

- [ ] **Step 1: Move the photo action**

Append to `src/app/dashboard/students/actions.ts` (copy the body of `students/[id]/actions.ts` `saveStudentPhoto`, keeping its `auth()` guard, `PhotoError` handling and `removePhoto === "1"` branch; drop the `revalidatePath(\`/dashboard/students/${studentId}\`)` line; keep `revalidatePath(PATH)`). Export `type PhotoState = { error?: string; success?: string }` from here too. Add the imports it needs (`auth`, `PhotoError`, `setStudentPhoto`, `clearStudentPhoto`, `numericField`).

- [ ] **Step 2: Move the photo form** — create `src/app/dashboard/students/_components/photo-form.tsx` with the content of `students/[id]/_components/photo-form.tsx`, changing the action import to `import { saveStudentPhoto, type PhotoState } from "../actions";`. Component name stays `StudentPhotoForm`, props `{ studentId: number; photoId: number | null; name: string }`.

- [ ] **Step 3: Create `student-pane.tsx`**

```tsx
"use client";

import { Pencil, Phone, X } from "lucide-react";
import { useState } from "react";
import { AttendanceStrip } from "@/components/ui/attendance-strip";
import { Button } from "@/components/ui/button";
import { DetailPane } from "@/components/ui/detail-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import type { StudentSummary } from "@/lib/registry/students";
import { StudentDetail, type StudentDetailData } from "./student-detail";
import { StudentPhotoForm } from "./photo-form";

const RELATION: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian" };
const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
const STATUS_TONE: Record<string, "ok" | "neutral" | "warn"> = { ACTIVE: "ok", LEFT: "neutral", GRADUATED: "warn" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", LEFT: "Left", GRADUATED: "Graduated" };

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function StudentPaneSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading student">
      <div className="flex gap-3"><Skeleton className="size-13 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3.5 w-1/2" /></div></div>
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );
}

/// The right-hand pane: read view by default, the existing editor in place
/// when "Edit" is pressed. `detail` is the row's editable shape; `summary`
/// is the server-rendered aggregate for the same student.
export function StudentPane({
  summary,
  detail,
  sections,
  academicYearId,
  onClose,
}: {
  summary: StudentSummary;
  detail: StudentDetailData;
  sections: { id: number; name: string; grade: { name: string } }[];
  academicYearId: number;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const primary = summary.guardians.find((g) => g.isPrimary) ?? summary.guardians[0] ?? null;

  return (
    <DetailPane
      title={summary.fullName}
      subtitle={
        <>
          {summary.fullNameNp ? <span className="font-devanagari text-ink-2">{summary.fullNameNp} · </span> : null}
          {summary.enrollment ? <>{summary.enrollment.sectionLabel} · Roll <span className="font-mono">{summary.enrollment.rollNo}</span></> : "Not enrolled this year"}
        </>
      }
      initials={initialsOf(summary.fullName)}
      photo={<StudentPhotoForm studentId={summary.studentId} photoId={summary.photoId} name={summary.fullName} />}
      actions={
        <>
          <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => setEditing((v) => !v)}>
            {editing ? <X data-icon="inline-start" aria-hidden="true" /> : <Pencil data-icon="inline-start" aria-hidden="true" />}
            {editing ? "Cancel" : "Edit"}
          </Button>
          {primary ? (
            <Button size="sm" variant="outline" render={<a href={`tel:${primary.phone}`} />}>
              <Phone data-icon="inline-start" aria-hidden="true" />
              Call guardian
            </Button>
          ) : null}
          {onClose ? <Button size="sm" variant="ghost" className="ml-auto" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></Button> : null}
        </>
      }
    >
      {editing ? (
        <div className="p-5">
          <StudentDetail data={detail} sections={sections} academicYearId={academicYearId} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <DetailPane.Section label="Record">
            <DetailPane.Facts
              items={[
                { label: "Admission no.", value: summary.admissionNo, mono: true },
                { label: "Status", value: <StatusDot tone={STATUS_TONE[summary.status] ?? "neutral"}>{STATUS_LABEL[summary.status] ?? summary.status}</StatusDot> },
                { label: "Born (BS)", value: summary.dobBs, mono: true },
                { label: "Born (AD)", value: summary.dobAd, mono: true },
                { label: "Gender", value: GENDER[summary.gender] ?? summary.gender },
                { label: "Address", value: summary.address ?? "—" },
                { label: "Admitted (BS)", value: summary.admittedOnBs, mono: true },
              ]}
            />
          </DetailPane.Section>

          <DetailPane.Section label={summary.guardians.length === 1 ? "Guardian" : "Guardians"}>
            <ul className="space-y-2">
              {summary.guardians.map((g) => (
                <li key={g.id} className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.fullName} <span className="text-ink-3 font-normal">· {RELATION[g.relation] ?? g.relation}{g.isPrimary ? " · primary" : ""}</span></p>
                    <p className="text-ink-3 font-mono text-xs tabular-nums">{g.phone}{g.occupation ? ` · ${g.occupation}` : ""}</p>
                  </div>
                </li>
              ))}
              {summary.guardians.length === 0 ? <li className="text-ink-3 text-sm">No guardian on record.</li> : null}
            </ul>
          </DetailPane.Section>

          <DetailPane.Section label="Attendance this year">
            <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {summary.attendance.percent == null ? "—" : `${summary.attendance.percent}%`}
              <span className="font-body text-ink-3 ml-1.5 text-[12.5px] font-normal tracking-normal">
                {summary.attendance.recorded === 0 ? "no roll calls yet" : `present · ${summary.attendance.recorded} days recorded`}
              </span>
            </p>
            <AttendanceStrip days={summary.attendance.days} size="lg" className="mt-2 w-full" />
          </DetailPane.Section>

          <DetailPane.Section label="Marks">
            {summary.exams.length === 0 ? (
              <p className="text-ink-3 text-sm">No marks entered this year.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.exams.map((e) => (
                  <li key={e.termId} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 text-[12.5px]">
                    <span>
                      {e.name}{" "}
                      <StatusDot tone={e.isPublished ? "ok" : "neutral"} className="ml-1">{e.isPublished ? "Published" : "Draft"}</StatusDot>
                    </span>
                    <span className="bg-line h-1.5 w-[90px] overflow-hidden rounded-full" aria-hidden="true">
                      <i className="bg-brand block h-full" style={{ width: `${e.percent ?? 0}%` }} />
                    </span>
                    <span className="w-10 text-right font-mono tabular-nums">{e.percent == null ? "—" : `${e.percent}%`}</span>
                  </li>
                ))}
              </ul>
            )}
          </DetailPane.Section>

          <DetailPane.Section label="History">
            <ul className="space-y-1.5 text-[12.5px]">
              {summary.history.map((h) => (
                <li key={`${h.year}-${h.sectionLabel}`}>
                  <span className="text-ink-3 font-mono tabular-nums">{h.enrolledOnBs}</span>&nbsp;&nbsp;{h.year} · {h.sectionLabel}, roll {h.rollNo}
                </li>
              ))}
            </ul>
          </DetailPane.Section>
        </>
      )}
    </DetailPane>
  );
}
```

`Button` composes with base-ui's `render` prop (see `button.tsx` — `ButtonPrimitive.Props`); if `render` is not accepted there, wrap the anchor around the button's content instead. `font-devanagari` exists since Phase 1.

- [ ] **Step 4: Create `students-workspace.tsx`**

```tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download, GraduationCap, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { AttendanceStrip, type DayStatus } from "@/components/ui/attendance-strip";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusDot } from "@/components/ui/status-dot";
import { useToastedActionState } from "@/components/ui/toast";
import type { StudentSummary } from "@/lib/registry/students";
import { removeStudent, type ActionState } from "../actions";
import { StudentPane, StudentPaneSkeleton } from "./student-pane";
import type { StudentDetailData } from "./student-detail";
import { AddStudentForm } from "./student-form";

export type StudentRow = StudentDetailData & {
  gradeName: string;
  rollNo: number;
  sectionLabel: string;
  dobLabel: string;
  guardianLabel: string;
  strip: DayStatus[];
};

type Section = { id: number; name: string; grade: { name: string } };

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", LEFT: "Left", GRADUATED: "Graduated" };
const STATUS_TONE: Record<string, "ok" | "neutral" | "warn"> = { ACTIVE: "ok", LEFT: "neutral", GRADUATED: "warn" };
const ALL = "all";

/// "Kindergarten A" → "KA", "Class 10 B" → "10B", "Senior Kindergarten A" → "SKA".
function sectionCode(gradeName: string, sectionName: string) {
  const num = gradeName.match(/\d+/)?.[0];
  const letters = num ? "" : gradeName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return `${num ?? letters}${sectionName.toUpperCase()}`;
}

function attendanceRate(strip: DayStatus[]) {
  const taken = strip.filter((d) => d !== "none");
  if (taken.length === 0) return null;
  return Math.round((taken.filter((d) => d === "present" || d === "late").length / taken.length) * 100);
}

const EMPTY: ActionState = {};

function DeleteRowButton({ row }: { row: StudentRow }) {
  const [, action, pending] = useToastedActionState(removeStudent, EMPTY);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="studentId" value={row.studentId} />
      <ConfirmSubmit icon size="xs" pending={pending} title={`Delete ${row.fullName}`} />
    </form>
  );
}

export function StudentsWorkspace({
  rows,
  sections,
  academicYearId,
  yearLabel,
  suggestedAdmissionNo,
  selectedId,
  summary,
}: {
  rows: StudentRow[];
  sections: Section[];
  academicYearId: number;
  yearLabel: string;
  suggestedAdmissionNo: string;
  /** From `?student=`; null when nothing is selected. */
  selectedId: number | null;
  /** The server-rendered summary for `selectedId`, or null while it is not loaded. */
  summary: StudentSummary | null;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  const initialTab = selectedId != null ? (rows.find((r) => r.studentId === selectedId)?.sectionId ?? ALL) : (sections[0]?.id ?? ALL);
  const [tab, setTab] = useState<string>(String(initialTab));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [optimisticId, setOptimisticId] = useState<number | null>(selectedId);
  const [addOpen, setAddOpen] = useState(false);

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.sectionId, (counts.get(r.sectionId) ?? 0) + 1);
    return [
      { id: ALL, code: "ALL", label: "All sections", count: rows.length },
      ...sections.map((s) => {
        const n = counts.get(s.id) ?? 0;
        return { id: String(s.id), code: sectionCode(s.grade.name, s.name), label: `${s.grade.name} ${s.name}`, count: n, empty: n === 0 };
      }),
    ];
  }, [rows, sections]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== ALL && String(r.sectionId) !== tab) return false;
      if (status !== "" && r.status !== status) return false;
      if (q && !`${r.fullName} ${r.fullNameNp ?? ""} ${r.admissionNo} ${r.guardianLabel}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, status, query]);

  const selectedRow = optimisticId == null ? null : rows.find((r) => r.studentId === optimisticId) ?? null;
  const summaryMatches = summary != null && summary.studentId === optimisticId;

  function select(row: StudentRow) {
    setOptimisticId(row.studentId);
    startNavigation(() => router.replace(`?student=${row.studentId}`, { scroll: false }));
  }
  function clearSelection() {
    setOptimisticId(null);
    startNavigation(() => router.replace("?", { scroll: false }));
  }

  const columns = useMemo<ColumnDef<StudentRow, unknown>[]>(
    () => [
      { id: "rollNo", accessorKey: "rollNo", header: "Roll", enableHiding: false, meta: { numeric: true, mono: true, width: "64px" } satisfies ColumnMeta },
      {
        id: "fullName", accessorKey: "fullName", header: "Name", enableHiding: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.fullName}
            {row.original.fullNameNp ? <span className="font-devanagari text-ink-3 block text-[11.5px] leading-tight font-normal">{row.original.fullNameNp}</span> : null}
          </span>
        ),
      },
      { id: "section", accessorKey: "sectionLabel", header: "Section", cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span> },
      { id: "admissionNo", accessorKey: "admissionNo", header: "Admission", meta: { numeric: true, mono: true } satisfies ColumnMeta },
      { id: "dob", accessorKey: "dobLabel", header: "Born (BS)", meta: { mono: true } satisfies ColumnMeta },
      { id: "guardian", accessorKey: "guardianLabel", header: "Guardian", cell: ({ row }) => {
        const g = row.original.guardians.find((x) => x.isPrimary) ?? row.original.guardians[0];
        return g ? <>{g.fullName} <span className="text-ink-3">· {g.relation[0]}{g.relation.slice(1).toLowerCase()}</span></> : <span className="text-ink-3">—</span>;
      } },
      { id: "strip", header: "Last 14 days", enableSorting: false, cell: ({ row }) => <AttendanceStrip days={row.original.strip} percent={attendanceRate(row.original.strip)} /> },
      { id: "status", accessorKey: "status", header: "Status", cell: ({ getValue }) => { const s = String(getValue()); return <StatusDot tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABEL[s] ?? s}</StatusDot>; } },
    ],
    [],
  );

  const currentTabLabel = tabs.find((t) => t.id === tab)?.label ?? "All sections";
  const exportHref = tab === ALL ? "/api/export/students" : `/api/export/students?section=${tab}`;

  return (
    <PageFrame
      eyebrow="People"
      title="Students"
      meta={`${rows.length} enrolled · ${yearLabel}`}
      actions={
        <>
          <Button variant="outline" render={<a href={exportHref} download />}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Export CSV
          </Button>
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button />}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Admit student
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Admit a student</SheetTitle>
                <SheetDescription>Dates are entered in Bikram Sambat and stored as Gregorian.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <AddStudentForm sections={sections} academicYearId={academicYearId} suggestedAdmissionNo={suggestedAdmissionNo} />
              </div>
            </SheetContent>
          </Sheet>
        </>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Sections" baseId={baseId} panelId={panelId} />
      </PageFrame.Tabs>

      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${currentTabLabel}`} aria-label={`Search ${currentTabLabel}`} className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </label>
        <FieldSelect aria-label="Status" value={status} onValueChange={(v) => setStatus(v ?? "")} options={[{ value: "ACTIVE", label: "Status: Active" }, { value: "LEFT", label: "Status: Left" }, { value: "GRADUATED", label: "Status: Graduated" }, { value: "", label: "Status: Any" }]} className="h-8" />
        <span className="flex-1" />
        <span className="text-ink-3 text-[12.5px]">{visible.length} {visible.length === 1 ? "student" : "students"}{selectedRow ? " · 1 selected" : ""}</span>
      </PageFrame.Toolbar>

      <PageFrame.Split
        aside={
          selectedRow ? (
            summaryMatches ? (
              <StudentPane key={summary!.studentId} summary={summary!} detail={selectedRow} sections={sections} academicYearId={academicYearId} onClose={clearSelection} />
            ) : (
              <StudentPaneSkeleton />
            )
          ) : undefined
        }
        asideTitle={selectedRow?.fullName ?? "Student"}
        asideOpen={selectedRow != null}
        onAsideClose={clearSelection}
      >
        <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
          <DataTable<StudentRow>
            id="students"
            columns={columns}
            rows={visible}
            getRowId={(r) => String(r.studentId)}
            selectedId={optimisticId == null ? null : String(optimisticId)}
            onSelect={select}
            rowActions={(row) => <DeleteRowButton row={row} />}
            initialSort={[{ id: "rollNo", desc: false }]}
            empty={{
              icon: rows.length === 0 ? UserPlus : GraduationCap,
              title: rows.length === 0 ? "No students admitted yet" : "No students match",
              description: rows.length === 0 ? "Admit the first student to start the roll." : "Try another section, status or search.",
              action: rows.length === 0 ? <Button onClick={() => setAddOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" />Admit student</Button> : undefined,
            }}
          />
        </PageFrame.Body>
      </PageFrame.Split>
    </PageFrame>
  );
}
```

Notes for the implementer: `FieldSelect` is a base-ui Select — check its `onValueChange` signature in `select.tsx:209-224` (it may be `onValueChange(value: string | null)`); `SheetTrigger`/`Button` compose with base-ui `render`. If `DataTable`'s `empty.action` type does not accept a node, pass it through `EmptyState`'s `action` prop shape as defined in `empty-state.tsx`.

- [ ] **Step 5: Rewrite `src/app/dashboard/students/page.tsx`**

```tsx
import { Info } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { requirePage } from "@/lib/auth/guard";
import { formatBs, toBsInput } from "@/lib/date/bs";
import { recentStudentStrips } from "@/lib/attendance/attendance";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSections } from "@/lib/registry/structure";
import { getStudentSummary, listEnrolledStudents, suggestAdmissionNo } from "@/lib/registry/students";
import { StudentsWorkspace, type StudentRow } from "./_components/students-workspace";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/students");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <PageFrame eyebrow="People" title="Students">
        <EmptyState
          icon={Info}
          title="No current academic year"
          description="Enrolments belong to a year. Set the current year on the Classes page first."
          action={<Button render={<Link href="/dashboard/classes" />}>Go to Classes</Button>}
        />
      </PageFrame>
    );
  }

  const { student } = await searchParams;
  const selectedId = student && /^\d+$/.test(student) ? Number(student) : null;
  const now = new Date();

  const [sections, enrollments, suggested, strips, summary] = await Promise.all([
    listSections(currentYear.id),
    listEnrolledStudents({ academicYearId: currentYear.id }),
    suggestAdmissionNo(),
    recentStudentStrips(currentYear.id, now, 14),
    selectedId == null ? Promise.resolve(null) : getStudentSummary(selectedId, currentYear.id, now),
  ]);

  const empty14: StudentRow["strip"] = Array.from({ length: 14 }, () => "none");

  // Dates are converted server-side so the client never re-derives them.
  const rows: StudentRow[] = enrollments.map((e) => {
    const primary = e.student.guardians.find((g) => g.isPrimary) ?? e.student.guardians[0];
    return {
      studentId: e.student.id,
      admissionNo: e.student.admissionNo,
      firstName: e.student.firstName,
      middleName: e.student.middleName,
      lastName: e.student.lastName,
      fullName: e.student.fullName,
      photoId: e.student.photoId,
      fullNameNp: e.student.fullNameNp,
      address: e.student.address,
      gender: e.student.gender,
      status: e.student.status,
      dobBs: toBsInput(e.student.dob),
      admittedOnBs: toBsInput(e.student.admittedOn),
      sectionId: e.sectionId,
      guardians: e.student.guardians.map((g) => ({
        id: g.id, relation: g.relation, fullName: g.fullName, phone: g.phone, occupation: g.occupation, isPrimary: g.isPrimary,
      })),
      rollNo: e.rollNo,
      gradeName: e.section.grade.name,
      sectionLabel: `${e.section.grade.name} ${e.section.name}`,
      dobLabel: formatBs(e.student.dob, "YYYY-MM-DD"),
      guardianLabel: primary ? `${primary.fullName} ${primary.phone}` : "",
      strip: strips.get(e.student.id) ?? empty14,
    };
  });

  return (
    <StudentsWorkspace
      rows={rows}
      sections={sections}
      academicYearId={currentYear.id}
      yearLabel={currentYear.nameBS}
      suggestedAdmissionNo={suggested}
      selectedId={selectedId}
      summary={summary}
    />
  );
}
```

When `sections.length === 0` the workspace still renders: the tab strip shows only "All sections", the table shows the "No students admitted yet" empty state, and `AddStudentForm` receives an empty `sections` list (its section select will be empty — acceptable; the Classes page is where sections are made). Keep it that way rather than hiding the page.

- [ ] **Step 6: Create `src/app/dashboard/students/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentsLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading students">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-14" /><Skeleton className="h-7 w-48" /></div>
        <div className="flex gap-2"><Skeleton className="h-8 w-28" /><Skeleton className="h-8 w-36" /></div>
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[34px] w-32 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex gap-2 py-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-8 w-32" /></div>
      <div className="border-line flex-1 space-y-px rounded-[10px] border p-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
    </div>
  );
}
```

- [ ] **Step 7: Delete the old files and fix references**

Run: `git rm -r "src/app/dashboard/students/[id]" src/app/dashboard/students/_components/students-view.tsx src/app/dashboard/students/_components/students-by-section.tsx` then `grep -rn "students-view\|students-by-section\|/dashboard/students/\${" src` → expected: no hits (any `StudentRow` import must now come from `./_components/students-workspace`).

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint . && npx vitest run && DB_TESTS=1 npx vitest run && npx next build 2>&1 | tail -5`. Build must list `/dashboard/students` and no `/dashboard/students/[id]`. Then, with the dev server running, `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard/students` → `200` (or `307` to login without a cookie).

- [ ] **Step 9: Commit**

```bash
git add -A src/app/dashboard/students
git commit -m "feat(students): register tabs, sortable table and split-view pane; ?student= replaces the [id] route

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 4: Staff page on the page contract

**Files:**
- Modify: `src/app/dashboard/teachers/page.tsx` (rewrite), `src/app/dashboard/teachers/actions.ts` (append `saveStaffPhoto`)
- Create: `_components/staff-workspace.tsx`, `_components/staff-pane.tsx`, `_components/staff-detail.tsx`, `_components/photo-form.tsx`, `teachers/loading.tsx`
- Delete: `teachers/[id]/`, `_components/teachers-view.tsx`, `_components/staff-by-role.tsx`
- Keep unchanged: `_components/teachers-forms.tsx` (`AddStaffForm`, no props)

**Interfaces:**
- Consumes: Task 1 `getStaffSummary`/`StaffSummary`; `listStaff()`; `StaffDetail` (moved) props `{ row: StaffRow; onDone: () => void }`; actions `toggleStaffActive`, `removeStaff`, `saveStaffPhoto`; `assignClassTeacher` stays exported from `teachers/actions.ts` (imported by `classes/_components/class-structure.tsx:12`).
- Produces: `StaffRow` exported from `staff-detail.tsx`; `<StaffWorkspace rows selectedId summary yearLabel />`.

- [ ] **Step 1: Move the photo action** — append `saveStaffPhoto` (+ `PhotoState`) to `teachers/actions.ts` exactly as in Task 3 Step 1 (drop the `[id]` revalidate, keep `revalidatePath(PATH)`).

- [ ] **Step 2: Move the photo form** — `_components/photo-form.tsx` from `[id]/_components/photo-form.tsx`, action import `from "../actions"`. Name `StaffPhotoForm`, props `{ staffId; photoId; name }`.

- [ ] **Step 3: Create `staff-detail.tsx`** — move `StaffRow` (the literal type at `teachers-view.tsx:21-36`) and the `StaffDetail` component (`teachers-view.tsx:44-128`) into this file verbatim, **removing** the `Link` to `/dashboard/teachers/${row.id}` (`teachers-view.tsx:61`) and its import. Do not move `TeacherRowActions` (its logic is rebuilt below).

- [ ] **Step 4: Create `staff-pane.tsx`**

```tsx
"use client";

import { Pencil, Phone, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailPane } from "@/components/ui/detail-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import type { StaffSummary } from "@/lib/registry/staff";
import { StaffDetail, type StaffRow } from "./staff-detail";
import { StaffPhotoForm } from "./photo-form";

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function StaffPaneSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading staff member">
      <div className="flex gap-3"><Skeleton className="size-13 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3.5 w-1/2" /></div></div>
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );
}

export function StaffPane({ summary, row, onClose }: { summary: StaffSummary; row: StaffRow; onClose?: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <DetailPane
      title={summary.fullName}
      subtitle={<>{summary.fullNameNp ? <span className="font-devanagari text-ink-2">{summary.fullNameNp} · </span> : null}{summary.designation}</>}
      initials={initialsOf(summary.fullName)}
      photo={<StaffPhotoForm staffId={summary.staffId} photoId={summary.photoId} name={summary.fullName} />}
      actions={
        <>
          <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => setEditing((v) => !v)}>
            {editing ? <X data-icon="inline-start" aria-hidden="true" /> : <Pencil data-icon="inline-start" aria-hidden="true" />}
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button size="sm" variant="outline" render={<a href={`tel:${summary.phone}`} />}>
            <Phone data-icon="inline-start" aria-hidden="true" />
            Call
          </Button>
          {onClose ? <Button size="sm" variant="ghost" className="ml-auto" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></Button> : null}
        </>
      }
    >
      {editing ? (
        <div className="p-5"><StaffDetail row={row} onDone={() => setEditing(false)} /></div>
      ) : (
        <>
          <DetailPane.Section label="Record">
            <DetailPane.Facts
              items={[
                { label: "Designation", value: summary.designation },
                { label: "Status", value: <StatusDot tone={summary.isActive ? "ok" : "neutral"}>{summary.isActive ? "Active" : "Inactive"}</StatusDot> },
                { label: "Phone", value: summary.phone, mono: true },
                { label: "Joined (BS)", value: summary.joinedOnBs, mono: true },
                { label: "Sign-in", value: summary.account ? summary.account.username : "No account" },
                { label: "Email", value: summary.account?.email ?? "—" },
              ]}
            />
          </DetailPane.Section>

          <DetailPane.Section label="Class teacher of">
            {summary.sectionsLed.length === 0 ? <p className="text-ink-3 text-sm">Not a class teacher.</p> : (
              <ul className="space-y-1 text-[12.5px]">{summary.sectionsLed.map((s) => <li key={s.id}>{s.label} <span className="text-ink-3">· {s.year}</span></li>)}</ul>
            )}
          </DetailPane.Section>

          <DetailPane.Section label="Teaching load">
            {summary.load.length === 0 ? <p className="text-ink-3 text-sm">No subjects assigned.</p> : summary.load.map((y) => (
              <div key={y.year} className="mb-2 last:mb-0">
                <p className="text-ink-3 mb-1 font-mono text-[11.5px]">{y.year} · {y.items.length} {y.items.length === 1 ? "subject" : "subjects"}</p>
                <ul className="space-y-0.5 text-[12.5px]">{y.items.map((it, i) => <li key={`${it.section}-${it.subject}-${i}`}>{it.subject} <span className="text-ink-3">· {it.section}</span></li>)}</ul>
              </div>
            ))}
          </DetailPane.Section>

          <DetailPane.Section label="Roll calls">
            <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {summary.rollCallsTaken}
              <span className="font-body text-ink-3 ml-1.5 text-[12.5px] font-normal tracking-normal">taken in total</span>
            </p>
          </DetailPane.Section>
        </>
      )}
    </DetailPane>
  );
}
```

- [ ] **Step 5: Create `staff-workspace.tsx`**

```tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusDot } from "@/components/ui/status-dot";
import { useToastedActionState } from "@/components/ui/toast";
import type { StaffSummary } from "@/lib/registry/staff";
import { removeStaff, toggleStaffActive, type ActionState } from "../actions";
import { StaffPane, StaffPaneSkeleton } from "./staff-pane";
import type { StaffRow } from "./staff-detail";
import { AddStaffForm } from "./teachers-forms";

const ALL = "all";
const EMPTY: ActionState = {};

/// "Vice Principal" → "VP", "Teacher" → "T".
function designationCode(d: string) {
  return d.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3) || "?";
}

function RowActions({ row }: { row: StaffRow }) {
  const [, toggle, toggling] = useToastedActionState(toggleStaffActive, EMPTY);
  const [, remove, removing] = useToastedActionState(removeStaff, EMPTY);
  const blocked = row.sectionsLed > 0 || row.assignments > 0;
  return (
    <>
      <form action={toggle} className="inline">
        <input type="hidden" name="staffId" value={row.id} />
        <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
        <Button type="submit" size="xs" variant="ghost" disabled={toggling} aria-label={row.isActive ? `Mark ${row.fullName} inactive` : `Mark ${row.fullName} active`}>
          {row.isActive ? "Deactivate" : "Activate"}
        </Button>
      </form>
      <form action={remove} className="inline">
        <input type="hidden" name="staffId" value={row.id} />
        <ConfirmSubmit icon size="xs" pending={removing} title={blocked ? "Remove class-teacher and subject assignments first" : `Delete ${row.fullName}`} />
      </form>
    </>
  );
}

export function StaffWorkspace({
  rows,
  selectedId,
  summary,
}: {
  rows: StaffRow[];
  selectedId: number | null;
  summary: StaffSummary | null;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  const [tab, setTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [optimisticId, setOptimisticId] = useState<number | null>(selectedId);
  const [addOpen, setAddOpen] = useState(false);

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<string, number>();
    for (const r of rows) { const d = r.designation.trim() || "Unspecified"; counts.set(d, (counts.get(d) ?? 0) + 1); }
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return [{ id: ALL, code: "ALL", label: "Everyone", count: rows.length }, ...groups.map(([d, n]) => ({ id: d, code: designationCode(d), label: d, count: n }))];
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== ALL && (r.designation.trim() || "Unspecified") !== tab) return false;
      if (status === "active" && !r.isActive) return false;
      if (status === "inactive" && r.isActive) return false;
      if (q && !`${r.fullName} ${r.fullNameNp ?? ""} ${r.phone} ${r.designation}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, status, query]);

  const selectedRow = optimisticId == null ? null : rows.find((r) => r.id === optimisticId) ?? null;
  const summaryMatches = summary != null && summary.staffId === optimisticId;

  function select(row: StaffRow) {
    setOptimisticId(row.id);
    startNavigation(() => router.replace(`?staff=${row.id}`, { scroll: false }));
  }
  function clearSelection() {
    setOptimisticId(null);
    startNavigation(() => router.replace("?", { scroll: false }));
  }

  const columns = useMemo<ColumnDef<StaffRow, unknown>[]>(
    () => [
      { id: "fullName", accessorKey: "fullName", header: "Name", enableHiding: false, cell: ({ row }) => (
        <span className="font-medium">{row.original.fullName}{row.original.fullNameNp ? <span className="font-devanagari text-ink-3 block text-[11.5px] leading-tight font-normal">{row.original.fullNameNp}</span> : null}</span>
      ) },
      { id: "designation", accessorKey: "designation", header: "Designation" },
      { id: "phone", accessorKey: "phone", header: "Phone", meta: { mono: true } satisfies ColumnMeta },
      { id: "load", accessorFn: (r) => r.sectionsLed * 100 + r.assignments, header: "Load", cell: ({ row }) => (
        <span className="text-ink-2">{row.original.sectionsLed} {row.original.sectionsLed === 1 ? "section" : "sections"} · {row.original.assignments} {row.original.assignments === 1 ? "subject" : "subjects"}</span>
      ) },
      { id: "joined", accessorKey: "joinedOnBs", header: "Joined (BS)", meta: { mono: true } satisfies ColumnMeta },
      { id: "status", accessorFn: (r) => (r.isActive ? 1 : 0), header: "Status", cell: ({ row }) => <StatusDot tone={row.original.isActive ? "ok" : "neutral"}>{row.original.isActive ? "Active" : "Inactive"}</StatusDot> },
    ],
    [],
  );

  return (
    <PageFrame
      eyebrow="People"
      title="Staff"
      meta={`${rows.length} on record · ${rows.filter((r) => r.isActive).length} active`}
      actions={
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetTrigger render={<Button />}><Plus data-icon="inline-start" aria-hidden="true" />Add staff</SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader><SheetTitle>Add a staff member</SheetTitle><SheetDescription>The Nepali name is optional here, but printed documents use it.</SheetDescription></SheetHeader>
            <div className="px-4 pb-6"><AddStaffForm /></div>
          </SheetContent>
        </Sheet>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Designations" baseId={baseId} panelId={panelId} />
      </PageFrame.Tabs>
      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search staff" className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </label>
        <FieldSelect aria-label="Status" value={status} onValueChange={(v) => setStatus(v ?? "all")} options={[{ value: "active", label: "Status: Active" }, { value: "inactive", label: "Status: Inactive" }, { value: "all", label: "Status: Any" }]} className="h-8" />
        <span className="flex-1" />
        <span className="text-ink-3 text-[12.5px]">{visible.length} {visible.length === 1 ? "person" : "people"}{selectedRow ? " · 1 selected" : ""}</span>
      </PageFrame.Toolbar>
      <PageFrame.Split
        aside={selectedRow ? (summaryMatches ? <StaffPane key={summary!.staffId} summary={summary!} row={selectedRow} onClose={clearSelection} /> : <StaffPaneSkeleton />) : undefined}
        asideTitle={selectedRow?.fullName ?? "Staff member"}
        asideOpen={selectedRow != null}
        onAsideClose={clearSelection}
      >
        <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
          <DataTable<StaffRow>
            id="staff"
            columns={columns}
            rows={visible}
            getRowId={(r) => String(r.id)}
            selectedId={optimisticId == null ? null : String(optimisticId)}
            onSelect={select}
            rowActions={(row) => <RowActions row={row} />}
            initialSort={[{ id: "fullName", desc: false }]}
            empty={{
              icon: rows.length === 0 ? UserPlus : Users,
              title: rows.length === 0 ? "No staff on record" : "No one matches",
              description: rows.length === 0 ? "Add the first staff member." : "Try another designation, status or search.",
              action: rows.length === 0 ? <Button onClick={() => setAddOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" />Add staff</Button> : undefined,
            }}
          />
        </PageFrame.Body>
      </PageFrame.Split>
    </PageFrame>
  );
}
```

- [ ] **Step 6: Rewrite `src/app/dashboard/teachers/page.tsx`**

```tsx
import { requirePage } from "@/lib/auth/guard";
import { formatBs, toBsInput } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { getStaffSummary, listStaff } from "@/lib/registry/staff";
import { StaffWorkspace } from "./_components/staff-workspace";
import type { StaffRow } from "./_components/staff-detail";

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  await requirePage("/dashboard/teachers");

  const { staff } = await searchParams;
  const selectedId = staff && /^\d+$/.test(staff) ? Number(staff) : null;

  const [people, currentYear] = await Promise.all([listStaff(), getCurrentAcademicYear()]);
  const summary = selectedId == null ? null : await getStaffSummary(selectedId, currentYear?.id ?? -1);

  const rows: StaffRow[] = people.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    fullName: p.fullName,
    fullNameNp: p.fullNameNp,
    photoId: p.photoId,
    phone: p.phone,
    designation: p.designation,
    joinedOnBs: toBsInput(p.joinedOn),
    joinedLabel: formatBs(p.joinedOn, "YYYY-MM-DD"),
    isActive: p.isActive,
    sectionsLed: p._count.sectionsLed,
    assignments: p._count.assignments,
  }));

  return <StaffWorkspace rows={rows} selectedId={selectedId} summary={summary} />;
}
```

Compare with the existing mapping at `teachers/page.tsx:22-37` and keep any field it derives that `StaffRow` requires (the `StaffRow` type is the literal one moved in Step 3).

- [ ] **Step 7: Create `teachers/loading.tsx`** — same as the Students skeleton with `aria-label="Loading staff"`.

- [ ] **Step 8: Delete old files and fix references**

Run: `git rm -r "src/app/dashboard/teachers/[id]" src/app/dashboard/teachers/_components/teachers-view.tsx src/app/dashboard/teachers/_components/staff-by-role.tsx` then `grep -rn "teachers-view\|staff-by-role\|/dashboard/teachers/\${" src` → no hits. `grep -n "assignClassTeacher" src/app/dashboard/classes/_components/class-structure.tsx` → still imports from `../../teachers/actions` and still compiles.

- [ ] **Step 9: Verify**

`npx tsc --noEmit -p tsconfig.json && npx eslint . && npx vitest run && DB_TESTS=1 npx vitest run && npx next build 2>&1 | tail -5`; build lists `/dashboard/teachers` without `[id]`.

- [ ] **Step 10: Commit**

```bash
git add -A src/app/dashboard/teachers
git commit -m "feat(staff): designation tabs, sortable table and split-view pane; ?staff= replaces the [id] route

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

### Task 5: Smoke, docs, wrap-up

**Files:**
- Modify: `scripts/ui-smoke.cjs` (add two deep-link routes), `docs/superpowers/specs/2026-08-29-option-c-redesign-design.md` (§6 note), this plan (outcome section)

- [ ] **Step 1: Extend the smoke routes**

In `scripts/ui-smoke.cjs` `ROUTES`, add `"dashboard/students?student=1"` and `"dashboard/teachers?staff=1"` (the filename replacement `route.replace(/\//g, "_")` also needs `.replace(/[?=]/g, "-")` — add that).

- [ ] **Step 2: Run the smoke and look**

`SMOKE_USER=<user> SMOKE_PASS=<pass> npm run smoke`; open `dashboard_students-1440-light.png`, `dashboard_students-student-1-1440-dark.png`, `dashboard_students-1000-light.png` (pane must be a Sheet, not inline), `dashboard_students-390-light.png`, and the teachers equivalents. Check: tab strip present with counts, table sortable headers, selected row highlighted with pane on the right at 1440, no double aside, no horizontal page scroll at 390, footer pager visible inside the body.

- [ ] **Step 3: Docs**

Append to the spec §6 table note: "Students and Staff deep-link via `?student=` / `?staff=`; selection is a `router.replace` so the pane is server-rendered." Append a "Phase 2a outcome" section to this plan listing the commit range and anything carried to 2b.

- [ ] **Step 4: Final gate and commit**

`npx tsc --noEmit -p tsconfig.json && npx eslint . && DB_TESTS=1 npx vitest run && npx next build 2>&1 | tail -3`

```bash
git add scripts/ui-smoke.cjs docs/superpowers
git commit -m "chore: smoke covers student/staff deep links; docs record Phase 2a

Claude-Session: https://claude.ai/code/session_01CyAwoVTj6wrc5RQFdV5PCz"
```

---

## Phase 2a exit criteria

- `/dashboard/students` and `/dashboard/teachers` render on `PageFrame` with `RegisterTabs`, `DataTable`, `DetailPane`; `/dashboard/students/[id]` and `/dashboard/teachers/[id]` no longer exist; `?student=`/`?staff=` pre-select a row and render its pane server-side.
- All existing server actions unchanged and still wired (admit, edit, move, delete, guardians, photo, add staff, toggle active, delete staff, assign class teacher from Classes).
- Tests: 219 + `strip` (6) + `summaries` (4) = 229 green with `DB_TESTS=1`; build green; smoke screenshots reviewed.

## Handled in Phase 2b (not gaps)

Classes, Subjects, Teaching, Roll call, Exams, Settings pages; Overview welcome + KPI strip; per-row "Print marksheet" action (needs the exams print page's query contract).

## Phase 2a outcome

Commit range: `7042cd4..HEAD` (this wrap-up commit — `7042cd4` was the plan's own commit; the range covers Tasks 1–5).

Patterns settled in review, to carry forward as the house style for later pages:

- `useOptimistic` keeps the selected row in sync with the URL instead of local `useState`.
- Anchor-rendered `Button`s pass `nativeButton={false}` so they render as `<a>` without a nested `<button>`.
- The status filter is seeded from the deep-linked row, so following a `?student=`/`?staff=` link lands on the tab that actually contains the row.
- An unknown `?student=`/`?staff=` id gets a server-side redirect rather than a client-side empty pane.
- The Students pane is scoped by `allowedSectionIds` so a teacher can't select a row outside their own sections via the URL.
- Photo upload lives in edit mode, not in the read-only pane.
- Loading skeletons use `role="status"` for the register tables and panes.
- Status maps (badge colour/label per enum value) are shared, not redefined per page.
- A blocked destructive action (`ConfirmSubmit`) is rendered `disabled` with an explanatory `title`, not just annotated while still armable.

Carried to Phase 2b:

- Per-row "Print marksheet" action (needs the exams print page's query contract).
- Extract `SearchField` / `PaneSkeleton` primitives once a third page needs them.
- Tab counts ignore search/status filters.
- Export CSV ignores status/search.
- Favicon (Phase 3).
- `AddPanel` / `PageHeader` / `Callout` / `record-table` dead-code check (Phase 3).
