# Year rollover — design spec

Date: 2026-09-02. Branch: `redesign/phase-2`.

## 1. Goal

Move the whole school from one academic year into the next in one guided flow:
copy the year-scoped structure (sections, subject offerings, teacher
assignments, timetable) into the new year, then place every active student in
it as promoted, retained, graduated or left.

Today `Section`, `SubjectOffering`, `TeacherAssignment`, `TimetablePeriod` and
`Enrollment` all hang off `academicYearId`, and nothing in `src/` writes across
years. The day 2083 ends, the office rebuilds every section, offering,
assignment and timetable period by hand and re-enrols every student one at a
time. This is the feature whose absence makes the app fail on a fixed date.

## 2. Decisions taken with the user

| Question | Decision |
|---|---|
| Scope | Structure and students together, one flow |
| Promotion rule | Everyone advances by default; last term's result and attendance shown as advice; office overrides individuals |
| Placement | Same section letter in the next grade; roll numbers renumbered through the existing `orderForRoll` |
| Safety | Preview then one transaction; re-running tops up what is missing; refuses once the target year has attendance or marks |
| Shape | A dedicated `/dashboard/rollover` page, not a dialog on Classes |
| Undo | Out of scope |

## 3. Behaviour

Source year is the current year. Target is a year picked or created in the flow
and must differ from the source. A run walks four stages in order, because each
stage needs the ids the previous one created.

### 3.1 Structure

- **Sections.** Every source section is recreated in the target on
  `(gradeId, name)`, carrying `classTeacherId` when that staff row is still
  `isActive`; otherwise the target section is created with no class teacher.
- **Offerings.** Copied per `(subjectId, gradeId)` with `hasPractical` and all
  four marks fields.
- **Assignments.** Copied with `sectionId` and `subjectOfferingId` remapped to
  the target rows. An assignment whose teacher is no longer `isActive` is
  skipped and counted.
- **Timetable.** Copied with `teacherAssignmentId` and the denormalised
  `sectionId` remapped, `dayOfWeek` and `room` carried over, and
  `schoolPeriodId` reused unchanged — `SchoolPeriod` is global, not year-scoped.
  A period whose assignment was skipped is skipped and counted.

Sections always copy — they are what everything else in the run hangs off, and
promoted students need somewhere to land. Offerings, assignments and timetable
are each an opt-out checkbox. Unticking one implicitly unticks the stages that
depend on it, since an assignment without an offering and a period without an
assignment cannot be written.

### 3.2 Students

Only students with `status = ACTIVE` and an enrolment in the source year are
considered. Each carries a decision, defaulting to Promote:

| Decision | Effect |
|---|---|
| Promote | Enrol in the grade at `order + 1`, same section name. No grade above means `status = GRADUATED` and no target enrolment. |
| Retain | Enrol in the same grade, same section name, in the target year. |
| Left | `status = LEFT`, no target enrolment. |

### 3.3 Placement gaps

A promotion needs a target section named the same as the source in the grade
above. When Grade 5 B promotes into a Grade 6 with no B, that whole group is
listed in the preview as unplaceable with a dropdown of the target grade's
sections. Confirmation is blocked until every group is resolved. The flow never
invents a section the school did not ask for.

### 3.4 Roll numbers

Per target section, the students placed there are ordered by the existing
`orderForRoll` in the order chosen for the run — `ALPHABETICAL`, `MARKS` or
`ADMISSION` — and numbered 1..n. `MARKS` requires an exam term from the source
year, selected in step 1. On a top-up re-run, students already enrolled in a
target section keep their numbers and newly placed students continue past the
highest, so a second run never renumbers a section the office has started using.

## 4. Module — `src/lib/registry/rollover.ts`

Two exports, split so the preview and the write cannot disagree:

```ts
export type StudentDecision = "PROMOTE" | "RETAIN" | "LEFT";

export type RolloverOptions = {
  copyOfferings: boolean;
  copyAssignments: boolean;
  copyTimetable: boolean;
  rollOrder: RollOrder;
  /// Required when rollOrder is "MARKS"; ignored otherwise.
  markOrderExamTermId: number | null;
  /// studentId -> decision. Absent means PROMOTE.
  decisions: Record<number, StudentDecision>;
  /// Source section id -> target section id, for groups with no same-named target.
  placements: Record<number, number>;
  makeTargetCurrent: boolean;
};

export type StageCount = { create: number; existing: number; skipped: number };

export type PlannedStudent = {
  studentId: number;
  fullName: string;
  fromSectionId: number;
  fromLabel: string;
};

export type PlacedStudent = PlannedStudent & {
  toSectionId: number;
  toLabel: string;
};

export type RolloverPlan = {
  sourceYear: { id: number; nameBS: string };
  targetYear: { id: number; nameBS: string };
  sections: StageCount;
  offerings: StageCount;
  assignments: StageCount;
  timetable: StageCount;
  students: {
    promote: PlacedStudent[];
    retain: PlacedStudent[];
    graduate: PlannedStudent[];
    leave: PlannedStudent[];
  };
  unplaceable: {
    sourceSectionId: number;
    label: string;
    count: number;
    choices: { id: number; label: string }[];
  }[];
  blockers: string[];
};

export function planRollover(
  sourceYearId: number,
  targetYearId: number,
  options: RolloverOptions,
): Promise<RolloverPlan>;

export function applyRollover(
  sourceYearId: number,
  targetYearId: number,
  options: RolloverOptions,
): Promise<RolloverPlan>;
```

`planRollover` only reads. `applyRollover` re-plans inside its own transaction
rather than trusting a plan posted from the browser, so a stale preview cannot
write stale rows, and returns the plan it actually applied. Both throw if the
plan has blockers; `applyRollover` checks again inside the transaction.

Because the target sections a plan needs may not exist yet, planning resolves
placement against the sections the run itself will create, not only those
already in the target year.

## 5. Safety

Idempotency rides on uniques that already exist, so every write is an
insert-if-missing rather than a blind create:

| Table | Unique |
|---|---|
| `Section` | `(gradeId, academicYearId, name)` |
| `SubjectOffering` | `(subjectId, gradeId, academicYearId)` |
| `Enrollment` | `(studentId, academicYearId)` |
| `TeacherAssignment` | `(staffId, sectionId, subjectOfferingId)` |
| `TimetablePeriod` | `(sectionId, dayOfWeek, schoolPeriodId)` |

A second run therefore creates only what is missing and reports the rest as
`existing`.

Blockers, each a sentence in `plan.blockers` that disables confirmation:

- the target year already holds `AttendanceSession` or `Mark` rows — the school
  is live in it and a bulk write is no longer safe;
- source and target are the same year;
- the source year has no sections;
- `rollOrder` is `MARKS` with no exam term chosen;
- an unplaceable group has no placement.

The write is one interactive `prisma.$transaction` with a raised timeout, since
the id remapping between stages has to be sequential. Making the target year
current is a checkbox, off by default: schools prepare next year while the
current one is still running, and `setCurrentAcademicYear` already exists for
doing it later from the switcher.

No schema change. No migration.

## 6. UI — `/dashboard/rollover`

`page.tsx` calls `requirePage("/dashboard/rollover")`, then loads the current
year, the candidate target years through `listAcademicYearsWithSize` (so the
switcher's "this year is empty" signal is reused), and the source year's exam
terms. It renders `RolloverWorkspace`. No current year renders the same
`EmptyState` the other pages use, pointing at Classes.

`_components/rollover-workspace.tsx` (client) follows the page contract:
`PageFrame` with eyebrow "School", title "Next year", meta `2083 → 2084`, a
toolbar, and a scrolling body. Three steps, each its own component so no file
carries the whole flow.

### 6.1 Step 1 — `year-step.tsx`

Target year select, with an inline "Create 2084" that calls the existing
`createAcademicYear`. Checkboxes for offerings, assignments and timetable. Roll
order select, plus an exam term select that appears only for `MARKS`. Blockers
render as `Callout`.

### 6.2 Step 2 — `students-step.tsx`

Grouped by source section, each group a card headed with the class, its
headcount and *All promote* / *All retain* buttons. A row shows the photo from
`/api/photo/{id}` or the initials tile the student pane uses, the name, the
current roll, the student's result in the source year's last published exam term
by end date (blank when that term covers nothing they sat) and the year's
attendance percentage — both advisory only, neither changes a default — and a
three-way Promote / Retain / Left control. A search
box filters by name across groups. A group in the top grade is labelled as
graduating, since Promote means graduate there.

### 6.3 Step 3 — `review-step.tsx`

A `Kpi` row — sections, offerings, assignments, periods, promoting, retaining,
graduating, leaving — each split into new and already there. Below it the
unplaceable groups with their target dropdowns, then the blockers. Confirm opens
a dialog naming the target year in full before it writes. On success the page
shows what was written and links to Classes in the new year.

## 7. Actions and permissions

`src/app/dashboard/rollover/actions.ts` gains `previewRollover` and
`runRollover`, both behind `requireCapability("manage:registry")`. No new
capability: anyone who can create sections and enrol students can already do
every part of this by hand, one row at a time.

- `ROUTE_CAPABILITY` gains
  `{ prefix: "/dashboard/rollover", capability: "manage:registry" }`, so
  navigation and the route guard stay in step.
- `NAV_GROUPS` gains
  `{ id: "rollover", label: "Next year", href: "/dashboard/rollover", icon: CalendarPlus }`
  at the end of the structure group. It stays out of `MOBILE_IDS`.
- The year switcher grows a link into the flow when the year being switched to
  has no sections.

## 8. Testing

- `src/lib/registry/rollover.test.ts` — pure planning over fixtures: grade
  advance by `order`, top grade graduating, unplaceable detection, decision
  tallies, and that section numbering goes through `orderForRoll`.
- `src/lib/registry/rollover.integration.test.ts`, gated on `DB_TESTS=1` — two
  grades by two sections with offerings, assignments and timetable. Asserts the
  created counts per stage; that a second run creates nothing and reports
  everything as existing; that attendance or a mark in the target year blocks;
  that Promote from the top grade sets `GRADUATED` with no enrolment; that Left
  writes no enrolment and sets `LEFT`; that rolls run 1..n in the chosen order;
  that an inactive teacher's assignments and their periods are skipped and
  counted.
- `src/lib/auth/roles.test.ts` — the new route capability for all three roles.
- The smoke script gains `dashboard/rollover`.
- Lint, typecheck and the full suite at the end.

No seed change: a second year is what this feature produces.

## 9. Out of scope

- Copying exam terms, conduct entries or activity entries into the new year.
- Undo. The re-run guard and the attendance/marks blocker are the protection.
- Per-student section overrides beyond the group-level resolution in step 3.
- Merging or splitting sections between years.
- Carrying honours weights, which are global settings already.
- Any fee, transfer certificate or archival concern.
