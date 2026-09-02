# Year Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the school move from one academic year into the next in one guided flow — copying sections, subject offerings, teacher assignments and the timetable, then placing every active student as promoted, retained, graduated or left.

**Architecture:** A pure planner (`rollover-plan.ts`) turns a database snapshot plus the operator's choices into a `RolloverPlan` and a `RolloverWrites` batch; a thin database layer (`rollover.ts`) loads the snapshot, exposes `planRollover` for the preview, and `applyRollover` which re-plans inside one interactive transaction and writes. All writes are insert-if-missing against uniques that already exist, so a second run tops up rather than duplicating. A three-step page at `/dashboard/rollover` drives it.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Prisma 6 on Postgres, Vitest 4, Tailwind 4 with the project's own `@/components/ui` set, `motion` for transitions.

**Spec:** `docs/superpowers/specs/2026-09-02-year-rollover-design.md`

## Global Constraints

- No schema change and no migration. Every write uses an existing unique: `Section(gradeId, academicYearId, name)`, `SubjectOffering(subjectId, gradeId, academicYearId)`, `Enrollment(studentId, academicYearId)`, `TeacherAssignment(staffId, sectionId, subjectOfferingId)`, `TimetablePeriod(sectionId, dayOfWeek, schoolPeriodId)`.
- Database test suites are gated: `describe.skipIf(!process.env.DB_TESTS)`. Run them with `DB_TESTS=1` set — Bash tool: `DB_TESTS=1 npx vitest run <file>`; PowerShell: `$env:DB_TESTS=1; npx vitest run <file>`. Without it they skip silently and prove nothing.
- Integration tests create only their own fixtures, tear everything down in `afterAll`, and restore the previously current academic year. Follow `src/lib/registry/registry.integration.test.ts` exactly.
- Use BS years around 2080–2095 in fixtures. The shared BS date field throws `DateOutOfRangeError` near 2000 BS.
- Every server action re-checks permission itself: `await requireCapability("manage:registry")`. Server actions are public POST endpoints.
- Sections always copy. Only offerings, assignments and timetable are opt-out, and unticking one implicitly unticks the stages that depend on it.
- Roll numbers come from the existing `orderForRoll` in `src/lib/registry/roll-order.ts`. Do not write a second ordering.
- `SchoolPeriod` is global, not year-scoped: copied timetable rows reuse `schoolPeriodId` unchanged.
- Comments in this codebase use `///` for the doc comment above an export and `//` for an inline aside, and they explain *why*, not what. Match that.
- Write files with the Write tool. Bash heredocs over roughly 200 lines fail to parse in this environment.

---

### Task 1: The pure planner — types and structure stages

The heart of the feature, with no database access at all, so it can be tested with plain objects. It mirrors `src/lib/honours/score.ts` (pure) sitting under `src/lib/honours/honours.ts` (database).

**Files:**
- Create: `src/lib/registry/rollover-plan.ts`
- Test: `src/lib/registry/rollover-plan.test.ts`

**Interfaces:**
- Consumes: `orderForRoll`, `RollOrder`, `RollCandidate` from `./roll-order`.
- Produces: `sectionKey`, `offeringKey`, `assignmentKey`, `periodKey`, the types `StudentDecision`, `RolloverOptions`, `RolloverSnapshot`, `RolloverPlan`, `RolloverWrites`, `StageCount`, `PlannedStudent`, `PlacedStudent`, `UnplaceableGroup`, and `buildPlan(snapshot, options): { plan: RolloverPlan; writes: RolloverWrites }`. Tasks 2–5 and 7–9 all consume these.

- [ ] **Step 1: Write the failing test**

Create `src/lib/registry/rollover-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildPlan, sectionKey, type RolloverOptions, type RolloverSnapshot } from "./rollover-plan";

/// Two grades, one section each, so the smallest interesting rollover is one
/// promotion and one graduation.
function snapshot(over: Partial<RolloverSnapshot> = {}): RolloverSnapshot {
  return {
    sourceYear: { id: 1, nameBS: "2083" },
    targetYear: { id: 2, nameBS: "2084" },
    grades: [
      { id: 10, name: "Class 5", order: 0 },
      { id: 11, name: "Class 6", order: 1 },
    ],
    sourceSections: [
      { id: 100, gradeId: 10, name: "A", classTeacherId: 500 },
      { id: 101, gradeId: 11, name: "A", classTeacherId: null },
    ],
    targetSections: [],
    sourceOfferings: [],
    targetOfferingKeys: [],
    sourceAssignments: [],
    targetAssignmentKeys: [],
    sourcePeriods: [],
    targetPeriodKeys: [],
    activeStaffIds: [500],
    offeringById: {},
    students: [],
    studentsAlreadyInTarget: [],
    targetRollHighWater: {},
    targetHasActivity: false,
    ...over,
  };
}

function options(over: Partial<RolloverOptions> = {}): RolloverOptions {
  return {
    copyOfferings: true,
    copyAssignments: true,
    copyTimetable: true,
    rollOrder: "ALPHABETICAL",
    markOrderExamTermId: null,
    decisions: {},
    placements: {},
    makeTargetCurrent: false,
    ...over,
  };
}

describe("buildPlan — structure", () => {
  it("copies every source section into the target year", () => {
    const { plan, writes } = buildPlan(snapshot(), options());

    expect(plan.sections).toEqual({ create: 2, existing: 0, skipped: 0 });
    expect(writes.sections.map((s) => s.key)).toEqual([
      sectionKey(10, "A"),
      sectionKey(11, "A"),
    ]);
  });

  it("counts a section the target year already has as existing, not a duplicate", () => {
    const { plan, writes } = buildPlan(
      snapshot({ targetSections: [{ id: 200, gradeId: 10, name: "A" }] }),
      options(),
    );

    expect(plan.sections).toEqual({ create: 1, existing: 1, skipped: 0 });
    expect(writes.sections).toHaveLength(1);
  });

  it("drops a class teacher who has left rather than carrying a stale one", () => {
    const { writes } = buildPlan(snapshot({ activeStaffIds: [] }), options());

    expect(writes.sections[0]!.classTeacherId).toBeNull();
  });

  it("copies offerings only when asked", () => {
    const offerings = [
      {
        subjectId: 30,
        gradeId: 10,
        hasPractical: false,
        fullMarksTheory: 100,
        passMarksTheory: 40,
        fullMarksPractical: null,
        passMarksPractical: null,
      },
    ];

    const on = buildPlan(snapshot({ sourceOfferings: offerings }), options());
    expect(on.plan.offerings.create).toBe(1);

    const off = buildPlan(
      snapshot({ sourceOfferings: offerings }),
      options({ copyOfferings: false }),
    );
    expect(off.plan.offerings.create).toBe(0);
    expect(off.writes.offerings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/registry/rollover-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./rollover-plan"`.

- [ ] **Step 3: Write the types and the structure half of the planner**

Create `src/lib/registry/rollover-plan.ts`:

```ts
import { orderForRoll, type RollCandidate, type RollOrder } from "./roll-order";

/// What happens to one student when the school moves into the next year.
export type StudentDecision = "PROMOTE" | "RETAIN" | "LEFT";

/// Sections are matched between years by grade and name, not by id — the whole
/// point of a rollover is that the target rows do not exist yet.
export type SectionKey = string;

export function sectionKey(gradeId: number, name: string): SectionKey {
  return `${gradeId}:${name}`;
}

export function offeringKey(subjectId: number, gradeId: number): string {
  return `${subjectId}:${gradeId}`;
}

export function assignmentKey(staffId: number, section: SectionKey, offering: string): string {
  return `${staffId}|${section}|${offering}`;
}

export function periodKey(section: SectionKey, dayOfWeek: number, schoolPeriodId: number): string {
  return `${section}|${dayOfWeek}|${schoolPeriodId}`;
}

export type RolloverOptions = {
  copyOfferings: boolean;
  copyAssignments: boolean;
  copyTimetable: boolean;
  rollOrder: RollOrder;
  /// Required when rollOrder is "MARKS"; ignored otherwise.
  markOrderExamTermId: number | null;
  /// studentId -> decision. Absent means PROMOTE.
  decisions: Record<number, StudentDecision>;
  /// Source section id -> target section id, for promotions with no same-named
  /// section waiting in the grade above.
  placements: Record<number, number>;
  makeTargetCurrent: boolean;
};

export type SnapshotSection = {
  id: number;
  gradeId: number;
  name: string;
  classTeacherId: number | null;
};

export type SnapshotOffering = {
  subjectId: number;
  gradeId: number;
  hasPractical: boolean;
  fullMarksTheory: number;
  passMarksTheory: number;
  fullMarksPractical: number | null;
  passMarksPractical: number | null;
};

export type SnapshotAssignment = {
  id: number;
  staffId: number;
  sectionId: number;
  subjectOfferingId: number;
};

export type SnapshotPeriod = {
  teacherAssignmentId: number;
  schoolPeriodId: number;
  dayOfWeek: number;
  room: string;
};

export type SnapshotStudent = {
  studentId: number;
  enrollmentId: number;
  fullName: string;
  admissionNo: string;
  photoId: number | null;
  sectionId: number;
  rollNo: number;
  /// Total in the exam term chosen for MARKS ordering, and the advice shown in
  /// step 2. Null means the student sat nothing, which is not a zero.
  total: number | null;
  attendancePercent: number | null;
};

/// Everything the planner needs, read once so planning itself is pure.
export type RolloverSnapshot = {
  sourceYear: { id: number; nameBS: string };
  targetYear: { id: number; nameBS: string };
  grades: { id: number; name: string; order: number }[];
  sourceSections: SnapshotSection[];
  targetSections: { id: number; gradeId: number; name: string }[];
  sourceOfferings: SnapshotOffering[];
  targetOfferingKeys: string[];
  sourceAssignments: SnapshotAssignment[];
  targetAssignmentKeys: string[];
  sourcePeriods: SnapshotPeriod[];
  targetPeriodKeys: string[];
  activeStaffIds: number[];
  /// Source offering id -> its subject and grade, so an assignment can be
  /// remapped onto the target year's copy of that offering.
  offeringById: Record<number, { subjectId: number; gradeId: number }>;
  students: SnapshotStudent[];
  studentsAlreadyInTarget: number[];
  /// Target section id -> the highest roll already handed out in it.
  targetRollHighWater: Record<number, number>;
  targetHasActivity: boolean;
};

export type StageCount = { create: number; existing: number; skipped: number };

export type PlannedStudent = {
  studentId: number;
  fullName: string;
  photoId: number | null;
  admissionNo: string;
  fromSectionId: number;
  fromLabel: string;
  total: number | null;
  attendancePercent: number | null;
};

export type PlacedStudent = PlannedStudent & {
  toSectionKey: SectionKey;
  toLabel: string;
  /// Null when the student already holds an enrolment in the target year and
  /// keeps the roll they were given there.
  rollNo: number | null;
  alreadyEnrolled: boolean;
};

export type UnplaceableGroup = {
  sourceSectionId: number;
  label: string;
  count: number;
  choices: { id: number; label: string }[];
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
  unplaceable: UnplaceableGroup[];
  blockers: string[];
};

/// The rows to insert, addressed by key. `applyRollover` resolves the keys to
/// ids as it creates each stage.
export type RolloverWrites = {
  sections: { key: SectionKey; gradeId: number; name: string; classTeacherId: number | null }[];
  offerings: (SnapshotOffering & { key: string })[];
  assignments: { key: string; staffId: number; sectionKey: SectionKey; offeringKey: string }[];
  periods: {
    assignmentKey: string;
    sectionKey: SectionKey;
    schoolPeriodId: number;
    dayOfWeek: number;
    room: string;
  }[];
  enrollments: { studentId: number; sectionKey: SectionKey; rollNo: number }[];
  graduateIds: number[];
  leaveIds: number[];
};

export function buildPlan(
  snapshot: RolloverSnapshot,
  options: RolloverOptions,
): { plan: RolloverPlan; writes: RolloverWrites } {
  const gradeById = new Map(snapshot.grades.map((g) => [g.id, g]));
  const activeStaff = new Set(snapshot.activeStaffIds);
  const sourceSectionById = new Map(snapshot.sourceSections.map((s) => [s.id, s]));
  const label = (gradeId: number, name: string) =>
    `${gradeById.get(gradeId)?.name ?? "Unknown grade"} ${name}`;

  // --- sections -------------------------------------------------------------
  const targetKeys = new Set(snapshot.targetSections.map((s) => sectionKey(s.gradeId, s.name)));
  const sections: RolloverWrites["sections"] = [];
  let sectionsExisting = 0;

  for (const s of snapshot.sourceSections) {
    const key = sectionKey(s.gradeId, s.name);
    if (targetKeys.has(key)) {
      sectionsExisting += 1;
      continue;
    }
    sections.push({
      key,
      gradeId: s.gradeId,
      name: s.name,
      // A departed teacher must not be carried into a year they will not teach.
      classTeacherId:
        s.classTeacherId !== null && activeStaff.has(s.classTeacherId) ? s.classTeacherId : null,
    });
  }

  /// Every section the target year will hold once this run finishes.
  const plannedSectionKeys = new Set([...targetKeys, ...sections.map((s) => s.key)]);

  // --- offerings ------------------------------------------------------------
  const targetOfferings = new Set(snapshot.targetOfferingKeys);
  const offerings: RolloverWrites["offerings"] = [];
  let offeringsExisting = 0;

  if (options.copyOfferings) {
    for (const o of snapshot.sourceOfferings) {
      const key = offeringKey(o.subjectId, o.gradeId);
      if (targetOfferings.has(key)) {
        offeringsExisting += 1;
        continue;
      }
      offerings.push({ ...o, key });
    }
  }

  const plannedOfferingKeys = new Set([...targetOfferings, ...offerings.map((o) => o.key)]);

  const plan: RolloverPlan = {
    sourceYear: snapshot.sourceYear,
    targetYear: snapshot.targetYear,
    sections: { create: sections.length, existing: sectionsExisting, skipped: 0 },
    offerings: { create: offerings.length, existing: offeringsExisting, skipped: 0 },
    assignments: { create: 0, existing: 0, skipped: 0 },
    timetable: { create: 0, existing: 0, skipped: 0 },
    students: { promote: [], retain: [], graduate: [], leave: [] },
    unplaceable: [],
    blockers: [],
  };

  const writes: RolloverWrites = {
    sections,
    offerings,
    assignments: [],
    periods: [],
    enrollments: [],
    graduateIds: [],
    leaveIds: [],
  };

  // Referenced by the stages added in the next tasks.
  void plannedSectionKeys;
  void plannedOfferingKeys;
  void sourceSectionById;
  void label;

  return { plan, writes };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/registry/rollover-plan.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/rollover-plan.ts src/lib/registry/rollover-plan.test.ts
git commit -m "feat(rollover): pure planner for the structure stages"
```

---

### Task 2: The pure planner — assignments and timetable

**Files:**
- Modify: `src/lib/registry/rollover-plan.ts`
- Test: `src/lib/registry/rollover-plan.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `writes.assignments` and `writes.periods` populated; `plan.assignments` and `plan.timetable` counted. Task 4 writes these rows.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/registry/rollover-plan.test.ts`:

```ts
/// One offering taught by one teacher in Class 5 A, with a single Sunday period.
function taught(over: Partial<RolloverSnapshot> = {}) {
  return snapshot({
    sourceOfferings: [
      {
        subjectId: 30,
        gradeId: 10,
        hasPractical: false,
        fullMarksTheory: 100,
        passMarksTheory: 40,
        fullMarksPractical: null,
        passMarksPractical: null,
      },
    ],
    offeringById: { 400: { subjectId: 30, gradeId: 10 } },
    sourceAssignments: [{ id: 600, staffId: 500, sectionId: 100, subjectOfferingId: 400 }],
    sourcePeriods: [
      { teacherAssignmentId: 600, schoolPeriodId: 70, dayOfWeek: 0, room: "R1" },
    ],
    ...over,
  });
}

describe("buildPlan — assignments and timetable", () => {
  it("remaps an assignment onto the target year's section and offering", () => {
    const { plan, writes } = buildPlan(taught(), options());

    expect(plan.assignments).toEqual({ create: 1, existing: 0, skipped: 0 });
    expect(writes.assignments[0]).toMatchObject({
      staffId: 500,
      sectionKey: sectionKey(10, "A"),
      offeringKey: "30:10",
    });
  });

  it("carries the period's day and room onto the copied assignment", () => {
    const { plan, writes } = buildPlan(taught(), options());

    expect(plan.timetable).toEqual({ create: 1, existing: 0, skipped: 0 });
    expect(writes.periods[0]).toMatchObject({
      sectionKey: sectionKey(10, "A"),
      schoolPeriodId: 70,
      dayOfWeek: 0,
      room: "R1",
    });
  });

  it("skips a teacher who has left, and the periods that hung off them", () => {
    const { plan, writes } = buildPlan(taught({ activeStaffIds: [] }), options());

    expect(plan.assignments).toEqual({ create: 0, existing: 0, skipped: 1 });
    expect(plan.timetable).toEqual({ create: 0, existing: 0, skipped: 1 });
    expect(writes.assignments).toEqual([]);
    expect(writes.periods).toEqual([]);
  });

  it("copies periods for an assignment the target year already had", () => {
    const existing = taught({
      targetSections: [{ id: 200, gradeId: 10, name: "A" }],
      targetOfferingKeys: ["30:10"],
      targetAssignmentKeys: [assignmentKey(500, sectionKey(10, "A"), "30:10")],
    });
    const { plan, writes } = buildPlan(existing, options());

    expect(plan.assignments.existing).toBe(1);
    expect(plan.timetable.create).toBe(1);
    expect(writes.periods).toHaveLength(1);
  });

  it("writes nothing downstream when assignments are not copied", () => {
    const { plan } = buildPlan(taught(), options({ copyAssignments: false }));

    expect(plan.assignments.create).toBe(0);
    expect(plan.timetable.create).toBe(0);
  });
});
```

Add `assignmentKey` to the import at the top of the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/registry/rollover-plan.test.ts`
Expected: FAIL — `expected { create: 0, existing: 0, skipped: 0 } to deeply equal { create: 1, ... }`.

- [ ] **Step 3: Implement the two stages**

In `src/lib/registry/rollover-plan.ts`, replace the `plan`/`writes`/`void` block at the end of `buildPlan` with:

```ts
  // --- assignments ----------------------------------------------------------
  const targetAssignments = new Set(snapshot.targetAssignmentKeys);
  const sourceAssignmentById = new Map(snapshot.sourceAssignments.map((a) => [a.id, a]));
  /// Source assignment id -> the key its target twin has or will have, so a
  /// period can find its assignment whether it was copied now or already there.
  const keyBySourceAssignment = new Map<number, string>();
  const assignments: RolloverWrites["assignments"] = [];
  let assignmentsExisting = 0;
  let assignmentsSkipped = 0;

  if (options.copyAssignments) {
    for (const a of snapshot.sourceAssignments) {
      const from = sourceSectionById.get(a.sectionId);
      const offering = snapshot.offeringById[a.subjectOfferingId];
      // A teacher who has left keeps their history but takes on nothing new.
      if (!from || !offering || !activeStaff.has(a.staffId)) {
        assignmentsSkipped += 1;
        continue;
      }

      const sKey = sectionKey(from.gradeId, from.name);
      const oKey = offeringKey(offering.subjectId, offering.gradeId);
      if (!plannedSectionKeys.has(sKey) || !plannedOfferingKeys.has(oKey)) {
        assignmentsSkipped += 1;
        continue;
      }

      const key = assignmentKey(a.staffId, sKey, oKey);
      keyBySourceAssignment.set(a.id, key);
      if (targetAssignments.has(key)) {
        assignmentsExisting += 1;
        continue;
      }
      assignments.push({ key, staffId: a.staffId, sectionKey: sKey, offeringKey: oKey });
    }
  }

  // --- timetable ------------------------------------------------------------
  const targetPeriods = new Set(snapshot.targetPeriodKeys);
  const periods: RolloverWrites["periods"] = [];
  let periodsExisting = 0;
  let periodsSkipped = 0;

  if (options.copyTimetable) {
    for (const p of snapshot.sourcePeriods) {
      const aKey = keyBySourceAssignment.get(p.teacherAssignmentId);
      const source = sourceAssignmentById.get(p.teacherAssignmentId);
      const from = source ? sourceSectionById.get(source.sectionId) : undefined;
      if (!aKey || !from) {
        periodsSkipped += 1;
        continue;
      }

      const sKey = sectionKey(from.gradeId, from.name);
      if (targetPeriods.has(periodKey(sKey, p.dayOfWeek, p.schoolPeriodId))) {
        periodsExisting += 1;
        continue;
      }
      periods.push({
        assignmentKey: aKey,
        sectionKey: sKey,
        schoolPeriodId: p.schoolPeriodId,
        dayOfWeek: p.dayOfWeek,
        room: p.room,
      });
    }
  }

  const plan: RolloverPlan = {
    sourceYear: snapshot.sourceYear,
    targetYear: snapshot.targetYear,
    sections: { create: sections.length, existing: sectionsExisting, skipped: 0 },
    offerings: { create: offerings.length, existing: offeringsExisting, skipped: 0 },
    assignments: {
      create: assignments.length,
      existing: assignmentsExisting,
      skipped: assignmentsSkipped,
    },
    timetable: { create: periods.length, existing: periodsExisting, skipped: periodsSkipped },
    students: { promote: [], retain: [], graduate: [], leave: [] },
    unplaceable: [],
    blockers: [],
  };

  const writes: RolloverWrites = {
    sections,
    offerings,
    assignments,
    periods,
    enrollments: [],
    graduateIds: [],
    leaveIds: [],
  };

  void label;

  return { plan, writes };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/registry/rollover-plan.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/rollover-plan.ts src/lib/registry/rollover-plan.test.ts
git commit -m "feat(rollover): plan assignment and timetable copies"
```

---

### Task 3: The pure planner — students, placement and blockers

**Files:**
- Modify: `src/lib/registry/rollover-plan.ts`
- Test: `src/lib/registry/rollover-plan.test.ts`

**Interfaces:**
- Consumes: everything Tasks 1–2 produced.
- Produces: `plan.students`, `plan.unplaceable`, `plan.blockers`, `writes.enrollments`, `writes.graduateIds`, `writes.leaveIds`. `buildPlan` is complete after this task.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/registry/rollover-plan.test.ts`:

```ts
function student(id: number, sectionId: number, over: Partial<SnapshotStudent> = {}): SnapshotStudent {
  return {
    studentId: id,
    enrollmentId: 900 + id,
    fullName: `Student ${id}`,
    admissionNo: String(id),
    photoId: null,
    sectionId,
    rollNo: 1,
    total: null,
    attendancePercent: null,
    ...over,
  };
}

describe("buildPlan — students", () => {
  it("promotes into the grade above, keeping the section letter", () => {
    const { plan, writes } = buildPlan(
      snapshot({ students: [student(1, 100)] }),
      options(),
    );

    expect(plan.students.promote).toHaveLength(1);
    expect(plan.students.promote[0]).toMatchObject({
      toSectionKey: sectionKey(11, "A"),
      toLabel: "Class 6 A",
      rollNo: 1,
    });
    expect(writes.enrollments[0]).toEqual({
      studentId: 1,
      sectionKey: sectionKey(11, "A"),
      rollNo: 1,
    });
  });

  it("graduates a student with no grade above them", () => {
    const { plan, writes } = buildPlan(
      snapshot({ students: [student(2, 101)] }),
      options(),
    );

    expect(plan.students.graduate.map((s) => s.studentId)).toEqual([2]);
    expect(writes.graduateIds).toEqual([2]);
    expect(writes.enrollments).toEqual([]);
  });

  it("keeps a retained student in their own grade and section", () => {
    const { plan } = buildPlan(
      snapshot({ students: [student(3, 100)] }),
      options({ decisions: { 3: "RETAIN" } }),
    );

    expect(plan.students.retain[0]).toMatchObject({ toSectionKey: sectionKey(10, "A") });
    expect(plan.students.promote).toEqual([]);
  });

  it("marks a leaver without enrolling them anywhere", () => {
    const { plan, writes } = buildPlan(
      snapshot({ students: [student(4, 100)] }),
      options({ decisions: { 4: "LEFT" } }),
    );

    expect(writes.leaveIds).toEqual([4]);
    expect(writes.enrollments).toEqual([]);
    expect(plan.students.leave).toHaveLength(1);
  });

  it("numbers a target section 1..n in the chosen order", () => {
    const students = [
      student(5, 100, { fullName: "Zenith Rai", admissionNo: "5" }),
      student(6, 100, { fullName: "Anisha Gurung", admissionNo: "6" }),
    ];
    const { writes } = buildPlan(snapshot({ students }), options());

    expect(writes.enrollments).toEqual([
      { studentId: 6, sectionKey: sectionKey(11, "A"), rollNo: 1 },
      { studentId: 5, sectionKey: sectionKey(11, "A"), rollNo: 2 },
    ]);
  });

  it("continues past the rolls a target section already handed out", () => {
    const { writes } = buildPlan(
      snapshot({
        students: [student(7, 100)],
        targetSections: [
          { id: 200, gradeId: 10, name: "A" },
          { id: 201, gradeId: 11, name: "A" },
        ],
        targetRollHighWater: { 201: 12 },
      }),
      options(),
    );

    expect(writes.enrollments[0]!.rollNo).toBe(13);
  });

  it("leaves a student already enrolled in the target year alone", () => {
    const { plan, writes } = buildPlan(
      snapshot({ students: [student(8, 100)], studentsAlreadyInTarget: [8] }),
      options(),
    );

    expect(writes.enrollments).toEqual([]);
    expect(plan.students.promote[0]).toMatchObject({ alreadyEnrolled: true, rollNo: null });
  });

  it("reports a promotion with no same-named section above as unplaceable", () => {
    const noSixB = snapshot({
      sourceSections: [
        { id: 100, gradeId: 10, name: "B", classTeacherId: null },
        { id: 101, gradeId: 11, name: "A", classTeacherId: null },
      ],
      students: [student(9, 100)],
    });
    const { plan } = buildPlan(noSixB, options());

    expect(plan.unplaceable).toHaveLength(1);
    expect(plan.unplaceable[0]).toMatchObject({ sourceSectionId: 100, count: 1 });
    expect(plan.blockers.join(" ")).toContain("Class 5 B");
  });

  it("places an unplaceable group once the operator picks a target", () => {
    const noSixB = snapshot({
      sourceSections: [
        { id: 100, gradeId: 10, name: "B", classTeacherId: null },
        { id: 101, gradeId: 11, name: "A", classTeacherId: null },
      ],
      targetSections: [{ id: 201, gradeId: 11, name: "A" }],
      students: [student(9, 100)],
    });
    const { plan, writes } = buildPlan(noSixB, options({ placements: { 100: 201 } }));

    expect(plan.unplaceable).toEqual([]);
    expect(plan.blockers).toEqual([]);
    expect(writes.enrollments[0]).toMatchObject({ sectionKey: sectionKey(11, "A") });
  });
});

describe("buildPlan — blockers", () => {
  it("refuses a target year that is already being taught in", () => {
    const { plan } = buildPlan(snapshot({ targetHasActivity: true }), options());

    expect(plan.blockers.join(" ")).toContain("attendance");
  });

  it("refuses to roll a year into itself", () => {
    const { plan } = buildPlan(
      snapshot({ targetYear: { id: 1, nameBS: "2083" } }),
      options(),
    );

    expect(plan.blockers.join(" ")).toContain("same academic year");
  });

  it("refuses a source year with no sections", () => {
    const { plan } = buildPlan(snapshot({ sourceSections: [] }), options());

    expect(plan.blockers.join(" ")).toContain("no sections");
  });

  it("refuses marks ordering with no exam term chosen", () => {
    const { plan } = buildPlan(snapshot(), options({ rollOrder: "MARKS" }));

    expect(plan.blockers.join(" ")).toContain("exam term");
  });
});
```

Add `type SnapshotStudent` to the test file's import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/registry/rollover-plan.test.ts`
Expected: FAIL — `expected [] to have a length of 1` on the first student test.

- [ ] **Step 3: Implement placement, roll numbering and blockers**

In `src/lib/registry/rollover-plan.ts`, replace `void label;` and the `return` at the end of `buildPlan` with:

```ts
  // --- students -------------------------------------------------------------
  const byOrder = [...snapshot.grades].sort((a, b) => a.order - b.order);
  const nextGradeId = new Map<number, number | null>();
  byOrder.forEach((g, i) => nextGradeId.set(g.id, byOrder[i + 1]?.id ?? null));

  const targetIdByKey = new Map(
    snapshot.targetSections.map((s) => [sectionKey(s.gradeId, s.name), s.id] as const),
  );
  const targetSectionById = new Map(snapshot.targetSections.map((s) => [s.id, s]));
  const alreadyInTarget = new Set(snapshot.studentsAlreadyInTarget);

  type Placement = { student: PlannedStudent; kind: "promote" | "retain"; key: SectionKey };
  const placements: Placement[] = [];
  const graduate: PlannedStudent[] = [];
  const leave: PlannedStudent[] = [];
  const stranded = new Map<number, PlannedStudent[]>();

  for (const s of snapshot.students) {
    const from = sourceSectionById.get(s.sectionId);
    // A student whose section is not in the source year is not this run's to move.
    if (!from) continue;

    const planned: PlannedStudent = {
      studentId: s.studentId,
      fullName: s.fullName,
      photoId: s.photoId,
      admissionNo: s.admissionNo,
      fromSectionId: from.id,
      fromLabel: label(from.gradeId, from.name),
      total: s.total,
      attendancePercent: s.attendancePercent,
    };

    const decision = options.decisions[s.studentId] ?? "PROMOTE";
    if (decision === "LEFT") {
      leave.push(planned);
      continue;
    }

    let gradeId = from.gradeId;
    if (decision === "PROMOTE") {
      const up = nextGradeId.get(from.gradeId) ?? null;
      // The top of the school has nowhere to promote to; that is graduation.
      if (up === null) {
        graduate.push(planned);
        continue;
      }
      gradeId = up;
    }

    let key: SectionKey | null = null;
    const override = decision === "PROMOTE" ? options.placements[from.id] : undefined;
    if (override !== undefined) {
      const chosen = targetSectionById.get(override);
      // An override into the wrong grade would silently demote the whole group.
      if (chosen && chosen.gradeId === gradeId) key = sectionKey(chosen.gradeId, chosen.name);
    } else {
      const want = sectionKey(gradeId, from.name);
      if (plannedSectionKeys.has(want)) key = want;
    }

    if (key === null) {
      stranded.set(from.id, [...(stranded.get(from.id) ?? []), planned]);
      continue;
    }
    placements.push({ student: planned, kind: decision === "RETAIN" ? "retain" : "promote", key });
  }

  // --- roll numbers ---------------------------------------------------------
  const rollByStudent = new Map<number, number>();
  const source = new Map(snapshot.students.map((s) => [s.studentId, s]));
  const bySection = new Map<SectionKey, Placement[]>();
  for (const p of placements) {
    bySection.set(p.key, [...(bySection.get(p.key) ?? []), p]);
  }

  for (const [key, group] of bySection) {
    const targetId = targetIdByKey.get(key);
    // A section the run is creating starts at 1; one that already exists picks
    // up after whatever the office has already handed out in it.
    let next = (targetId === undefined ? 0 : (snapshot.targetRollHighWater[targetId] ?? 0)) + 1;

    const fresh = group.filter((p) => !alreadyInTarget.has(p.student.studentId));
    const candidates: RollCandidate[] = fresh.map((p) => {
      const s = source.get(p.student.studentId)!;
      return {
        enrollmentId: s.enrollmentId,
        fullName: s.fullName,
        admissionNo: s.admissionNo,
        total: s.total,
      };
    });
    const studentByEnrollment = new Map(fresh.map((p) => [source.get(p.student.studentId)!.enrollmentId, p]));

    for (const ordered of orderForRoll(candidates, options.rollOrder)) {
      const p = studentByEnrollment.get(ordered.enrollmentId);
      if (p) rollByStudent.set(p.student.studentId, next++);
    }
  }

  const place = (p: Placement): PlacedStudent => ({
    ...p.student,
    toSectionKey: p.key,
    toLabel: labelForKey(p.key, gradeById),
    rollNo: rollByStudent.get(p.student.studentId) ?? null,
    alreadyEnrolled: alreadyInTarget.has(p.student.studentId),
  });

  const promote = placements.filter((p) => p.kind === "promote").map(place);
  const retain = placements.filter((p) => p.kind === "retain").map(place);

  const enrollments = placements
    .filter((p) => !alreadyInTarget.has(p.student.studentId))
    .map((p) => ({
      studentId: p.student.studentId,
      sectionKey: p.key,
      rollNo: rollByStudent.get(p.student.studentId)!,
    }));

  // --- unplaceable groups and blockers -------------------------------------
  const unplaceable: UnplaceableGroup[] = [...stranded.entries()].map(([sourceSectionId, list]) => {
    const from = sourceSectionById.get(sourceSectionId)!;
    const up = nextGradeId.get(from.gradeId) ?? null;
    return {
      sourceSectionId,
      label: label(from.gradeId, from.name),
      count: list.length,
      choices: snapshot.targetSections
        .filter((t) => t.gradeId === up)
        .map((t) => ({ id: t.id, label: label(t.gradeId, t.name) })),
    };
  });

  const blockers: string[] = [];
  if (snapshot.sourceYear.id === snapshot.targetYear.id) {
    blockers.push("Source and target are the same academic year.");
  }
  if (snapshot.sourceSections.length === 0) {
    blockers.push(`Academic year ${snapshot.sourceYear.nameBS} has no sections to copy.`);
  }
  if (snapshot.targetHasActivity) {
    blockers.push(
      `Academic year ${snapshot.targetYear.nameBS} already has attendance or marks recorded, so it is too late to roll into it.`,
    );
  }
  if (options.rollOrder === "MARKS" && options.markOrderExamTermId === null) {
    blockers.push("Choose the exam term the roll order should follow.");
  }
  for (const group of unplaceable) {
    blockers.push(`${group.label} has ${group.count} student(s) with nowhere to go in the grade above.`);
  }

  const plan: RolloverPlan = {
    sourceYear: snapshot.sourceYear,
    targetYear: snapshot.targetYear,
    sections: { create: sections.length, existing: sectionsExisting, skipped: 0 },
    offerings: { create: offerings.length, existing: offeringsExisting, skipped: 0 },
    assignments: {
      create: assignments.length,
      existing: assignmentsExisting,
      skipped: assignmentsSkipped,
    },
    timetable: { create: periods.length, existing: periodsExisting, skipped: periodsSkipped },
    students: { promote, retain, graduate, leave },
    unplaceable,
    blockers,
  };

  const writes: RolloverWrites = {
    sections,
    offerings,
    assignments,
    periods,
    enrollments,
    graduateIds: graduate.map((s) => s.studentId),
    leaveIds: leave.map((s) => s.studentId),
  };

  return { plan, writes };
}

/// A section key reads `gradeId:name`; the display label needs the grade's own
/// name, which only the caller's grade map has.
function labelForKey(key: SectionKey, gradeById: Map<number, { name: string }>): string {
  const [gradeId, ...rest] = key.split(":");
  return `${gradeById.get(Number(gradeId))?.name ?? "Unknown grade"} ${rest.join(":")}`;
}
```

Delete the earlier `plan`/`writes` declarations and `return` left over from Task 2 — there must be exactly one of each in the function.

- [ ] **Step 4: Run the whole planner suite**

Run: `npx vitest run src/lib/registry/rollover-plan.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/rollover-plan.ts src/lib/registry/rollover-plan.test.ts
git commit -m "feat(rollover): plan student placement, rolls and blockers"
```

---

### Task 4: The snapshot loader and `planRollover`

**Files:**
- Create: `src/lib/registry/rollover.ts`
- Test: `src/lib/registry/rollover.integration.test.ts`

**Interfaces:**
- Consumes: `buildPlan` and every type from `./rollover-plan`; `prisma` from `@/lib/prisma`.
- Produces: `loadSnapshot(sourceYearId, targetYearId, markOrderExamTermId)`, `planRollover(sourceYearId, targetYearId, options): Promise<RolloverPlan>`, and `RolloverError`. Task 5 adds `applyRollover` to the same file; Task 7's actions call both.

- [ ] **Step 1: Write the failing test**

Create `src/lib/registry/rollover.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createAcademicYear, setCurrentAcademicYear } from "./academic-year";
import { planRollover } from "./rollover";
import type { RolloverOptions } from "./rollover-plan";

// Talks to the real database. Everything it makes is torn down afterwards, and
// it touches nothing it did not create.
const made = {
  sourceYearId: 0,
  targetYearId: 0,
  gradeIds: [] as number[],
  sectionIds: [] as number[],
  subjectIds: [] as number[],
  offeringIds: [] as number[],
  staffIds: [] as number[],
  studentIds: [] as number[],
  previousCurrentYearId: null as number | null,
};

const SOURCE = "2091";
const TARGET = "2092";
const LOWER = "__rollover Class 9";
const UPPER = "__rollover Class 10";

function options(over: Partial<RolloverOptions> = {}): RolloverOptions {
  return {
    copyOfferings: true,
    copyAssignments: true,
    copyTimetable: true,
    rollOrder: "ALPHABETICAL",
    markOrderExamTermId: null,
    decisions: {},
    placements: {},
    makeTargetCurrent: false,
    ...over,
  };
}

beforeAll(async () => {
  if (!process.env.DB_TESTS) return;

  const current = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  made.previousCurrentYearId = current?.id ?? null;

  const source = await createAcademicYear({ nameBS: SOURCE });
  const target = await createAcademicYear({ nameBS: TARGET });
  made.sourceYearId = source.id;
  made.targetYearId = target.id;

  // Grade order is global, so these sit above anything the app already has.
  const highest = await prisma.grade.findFirst({ orderBy: { order: "desc" } });
  const base = (highest?.order ?? -1) + 1;
  const lower = await prisma.grade.create({ data: { name: LOWER, order: base } });
  const upper = await prisma.grade.create({ data: { name: UPPER, order: base + 1 } });
  made.gradeIds.push(lower.id, upper.id);

  const staff = await prisma.staff.create({
    data: {
      firstName: "Rollover",
      lastName: "Teacher",
      fullName: "Rollover Teacher",
      phone: "9800000000",
      designation: "Teacher",
      joinedOn: new Date("2023-01-01"),
    },
  });
  made.staffIds.push(staff.id);

  for (const [grade, name] of [
    [lower.id, "A"],
    [lower.id, "B"],
    [upper.id, "A"],
    [upper.id, "B"],
  ] as const) {
    const section = await prisma.section.create({
      data: {
        name,
        gradeId: grade,
        academicYearId: source.id,
        classTeacherId: grade === lower.id && name === "A" ? staff.id : null,
      },
    });
    made.sectionIds.push(section.id);
  }

  const subject = await prisma.subject.create({ data: { name: "__rollover Maths" } });
  made.subjectIds.push(subject.id);
  const offering = await prisma.subjectOffering.create({
    data: {
      subjectId: subject.id,
      gradeId: lower.id,
      academicYearId: source.id,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    },
  });
  made.offeringIds.push(offering.id);

  const assignment = await prisma.teacherAssignment.create({
    data: { staffId: staff.id, sectionId: made.sectionIds[0]!, subjectOfferingId: offering.id },
  });
  const period = await prisma.schoolPeriod.findFirst({ orderBy: { order: "asc" } });
  if (period) {
    await prisma.timetablePeriod.create({
      data: {
        teacherAssignmentId: assignment.id,
        sectionId: made.sectionIds[0]!,
        schoolPeriodId: period.id,
        dayOfWeek: 0,
        room: "R1",
      },
    });
  }

  // Two students in the lower A section, deliberately out of alphabetical order.
  for (const [i, name] of ["Zenith Rai", "Anisha Gurung"].entries()) {
    const student = await prisma.student.create({
      data: {
        admissionNo: `__ro-${i}`,
        firstName: name.split(" ")[0]!,
        lastName: name.split(" ")[1]!,
        fullName: name,
        dob: new Date("2012-01-01"),
        gender: "MALE",
        admittedOn: new Date("2023-01-01"),
      },
    });
    made.studentIds.push(student.id);
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        sectionId: made.sectionIds[0]!,
        academicYearId: source.id,
        rollNo: i + 1,
        enrolledOn: new Date("2023-01-01"),
      },
    });
  }
});

afterAll(async () => {
  if (!process.env.DB_TESTS) return;

  const years = [made.sourceYearId, made.targetYearId].filter(Boolean);
  await prisma.timetablePeriod.deleteMany({
    where: { section: { academicYearId: { in: years } } },
  });
  await prisma.teacherAssignment.deleteMany({
    where: { section: { academicYearId: { in: years } } },
  });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  await prisma.subjectOffering.deleteMany({ where: { academicYearId: { in: years } } });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjectIds } } });
  await prisma.section.deleteMany({ where: { academicYearId: { in: years } } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staffIds } } });
  await prisma.grade.deleteMany({ where: { id: { in: made.gradeIds } } });
  await prisma.academicYear.deleteMany({ where: { id: { in: years } } });

  // Deleting the fixture years would otherwise leave the school with no current
  // year at all, which blanks every page.
  if (made.previousCurrentYearId !== null) {
    const still = await prisma.academicYear.findUnique({
      where: { id: made.previousCurrentYearId },
      select: { id: true },
    });
    if (still) await setCurrentAcademicYear(made.previousCurrentYearId);
  }
  await prisma.$disconnect();
});

// Needs a live database, so it is opt-in: DB_TESTS=1 npx vitest run
describe.skipIf(!process.env.DB_TESTS)("rollover planning", () => {
  it("counts everything the run would create", async () => {
    const plan = await planRollover(made.sourceYearId, made.targetYearId, options());

    expect(plan.sections).toMatchObject({ create: 4, existing: 0 });
    expect(plan.offerings).toMatchObject({ create: 1, existing: 0 });
    expect(plan.assignments).toMatchObject({ create: 1, existing: 0 });
    expect(plan.blockers).toEqual([]);
  });

  it("promotes the lower grade and graduates the upper one", async () => {
    const plan = await planRollover(made.sourceYearId, made.targetYearId, options());

    expect(plan.students.promote).toHaveLength(2);
    expect(plan.students.promote.map((s) => s.toLabel)).toEqual([
      `${UPPER} A`,
      `${UPPER} A`,
    ]);
    expect(plan.students.graduate).toEqual([]);
  });

  it("orders the new rolls alphabetically", async () => {
    const plan = await planRollover(made.sourceYearId, made.targetYearId, options());
    const rolls = plan.students.promote.map((s) => [s.fullName, s.rollNo]);

    expect(rolls).toEqual([
      ["Anisha Gurung", 1],
      ["Zenith Rai", 2],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/rollover.integration.test.ts`
Expected: FAIL — `Failed to resolve import "./rollover"`.

- [ ] **Step 3: Write the loader**

Create `src/lib/registry/rollover.ts`:

```ts
import { prisma } from "@/lib/prisma";
import {
  assignmentKey,
  buildPlan,
  offeringKey,
  periodKey,
  sectionKey,
  type RolloverOptions,
  type RolloverPlan,
  type RolloverSnapshot,
} from "./rollover-plan";

export class RolloverError extends Error {}

/// Reads every row a rollover has to reason about in one pass, so the planner
/// itself can stay pure and be tested with plain objects.
export async function loadSnapshot(
  sourceYearId: number,
  targetYearId: number,
  markOrderExamTermId: number | null,
): Promise<RolloverSnapshot> {
  const [sourceYear, targetYear] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: sourceYearId } }),
    prisma.academicYear.findUnique({ where: { id: targetYearId } }),
  ]);
  if (!sourceYear) throw new RolloverError("That source academic year no longer exists.");
  if (!targetYear) throw new RolloverError("That target academic year no longer exists.");

  const [
    grades,
    sourceSections,
    targetSections,
    sourceOfferings,
    targetOfferings,
    activeStaff,
    targetEnrollments,
    attendance,
    marks,
  ] = await Promise.all([
    prisma.grade.findMany({ orderBy: { order: "asc" } }),
    prisma.section.findMany({ where: { academicYearId: sourceYearId } }),
    prisma.section.findMany({ where: { academicYearId: targetYearId } }),
    prisma.subjectOffering.findMany({ where: { academicYearId: sourceYearId } }),
    prisma.subjectOffering.findMany({ where: { academicYearId: targetYearId } }),
    prisma.staff.findMany({ where: { isActive: true }, select: { id: true } }),
    prisma.enrollment.findMany({
      where: { academicYearId: targetYearId },
      select: { studentId: true, sectionId: true, rollNo: true },
    }),
    prisma.attendanceSession.count({ where: { academicYearId: targetYearId } }),
    prisma.mark.count({ where: { examTerm: { academicYearId: targetYearId } } }),
  ]);

  const sourceSectionIds = sourceSections.map((s) => s.id);
  const targetSectionIds = targetSections.map((s) => s.id);

  const [sourceAssignments, targetAssignments, sourcePeriods, targetPeriods, enrollments] =
    await Promise.all([
      prisma.teacherAssignment.findMany({ where: { sectionId: { in: sourceSectionIds } } }),
      prisma.teacherAssignment.findMany({ where: { sectionId: { in: targetSectionIds } } }),
      prisma.timetablePeriod.findMany({ where: { sectionId: { in: sourceSectionIds } } }),
      prisma.timetablePeriod.findMany({ where: { sectionId: { in: targetSectionIds } } }),
      prisma.enrollment.findMany({
        where: { academicYearId: sourceYearId, student: { status: "ACTIVE" } },
        include: {
          student: {
            select: { id: true, fullName: true, admissionNo: true, photoId: true },
          },
        },
      }),
    ]);

  // Offerings are needed from both years to key an assignment by subject and
  // grade rather than by an id that means nothing in the target year.
  const offeringById: RolloverSnapshot["offeringById"] = {};
  for (const o of [...sourceOfferings, ...targetOfferings]) {
    offeringById[o.id] = { subjectId: o.subjectId, gradeId: o.gradeId };
  }

  const sourceSectionById = new Map(sourceSections.map((s) => [s.id, s]));
  const targetSectionById = new Map(targetSections.map((s) => [s.id, s]));
  const targetAssignmentById = new Map(targetAssignments.map((a) => [a.id, a]));

  const totals = await loadTotals(
    markOrderExamTermId,
    enrollments.map((e) => e.studentId),
  );
  const attendanceByStudent = await loadAttendance(sourceYearId, sourceSectionIds);

  const highWater: Record<number, number> = {};
  for (const e of targetEnrollments) {
    highWater[e.sectionId] = Math.max(highWater[e.sectionId] ?? 0, e.rollNo);
  }

  return {
    sourceYear: { id: sourceYear.id, nameBS: sourceYear.nameBS },
    targetYear: { id: targetYear.id, nameBS: targetYear.nameBS },
    grades: grades.map((g) => ({ id: g.id, name: g.name, order: g.order })),
    sourceSections: sourceSections.map((s) => ({
      id: s.id,
      gradeId: s.gradeId,
      name: s.name,
      classTeacherId: s.classTeacherId,
    })),
    targetSections: targetSections.map((s) => ({ id: s.id, gradeId: s.gradeId, name: s.name })),
    sourceOfferings: sourceOfferings.map((o) => ({
      subjectId: o.subjectId,
      gradeId: o.gradeId,
      hasPractical: o.hasPractical,
      fullMarksTheory: o.fullMarksTheory,
      passMarksTheory: o.passMarksTheory,
      fullMarksPractical: o.fullMarksPractical,
      passMarksPractical: o.passMarksPractical,
    })),
    targetOfferingKeys: targetOfferings.map((o) => offeringKey(o.subjectId, o.gradeId)),
    sourceAssignments: sourceAssignments.map((a) => ({
      id: a.id,
      staffId: a.staffId,
      sectionId: a.sectionId,
      subjectOfferingId: a.subjectOfferingId,
    })),
    targetAssignmentKeys: targetAssignments.flatMap((a) => {
      const section = targetSectionById.get(a.sectionId);
      const offering = offeringById[a.subjectOfferingId];
      if (!section || !offering) return [];
      return [
        assignmentKey(
          a.staffId,
          sectionKey(section.gradeId, section.name),
          offeringKey(offering.subjectId, offering.gradeId),
        ),
      ];
    }),
    sourcePeriods: sourcePeriods.map((p) => ({
      teacherAssignmentId: p.teacherAssignmentId,
      schoolPeriodId: p.schoolPeriodId,
      dayOfWeek: p.dayOfWeek,
      room: p.room,
    })),
    targetPeriodKeys: targetPeriods.flatMap((p) => {
      const assignment = targetAssignmentById.get(p.teacherAssignmentId);
      const section = assignment ? targetSectionById.get(assignment.sectionId) : undefined;
      if (!section) return [];
      return [periodKey(sectionKey(section.gradeId, section.name), p.dayOfWeek, p.schoolPeriodId)];
    }),
    activeStaffIds: activeStaff.map((s) => s.id),
    offeringById,
    students: enrollments.flatMap((e) => {
      if (!sourceSectionById.has(e.sectionId)) return [];
      return [
        {
          studentId: e.studentId,
          enrollmentId: e.id,
          fullName: e.student.fullName,
          admissionNo: e.student.admissionNo,
          photoId: e.student.photoId,
          sectionId: e.sectionId,
          rollNo: e.rollNo,
          total: totals.get(e.studentId) ?? null,
          attendancePercent: attendanceByStudent.get(e.studentId) ?? null,
        },
      ];
    }),
    studentsAlreadyInTarget: targetEnrollments.map((e) => e.studentId),
    targetRollHighWater: highWater,
    targetHasActivity: attendance > 0 || marks > 0,
  };
}

/// Each student's total in one exam term. Absent means they sat nothing, which
/// `orderForRoll` ranks below a zero rather than as one.
async function loadTotals(examTermId: number | null, studentIds: number[]) {
  const totals = new Map<number, number>();
  if (examTermId === null || studentIds.length === 0) return totals;

  const grouped = await prisma.mark.groupBy({
    by: ["studentId"],
    where: { examTermId, studentId: { in: studentIds } },
    _sum: { theory: true, practical: true },
  });
  for (const row of grouped) {
    totals.set(row.studentId, (row._sum.theory ?? 0) + (row._sum.practical ?? 0));
  }
  return totals;
}

/// Present days over recorded days, as a whole percentage. Advice for step 2
/// only — it never changes a decision.
async function loadAttendance(academicYearId: number, sectionIds: number[]) {
  const percent = new Map<number, number>();
  if (sectionIds.length === 0) return percent;

  const rows = await prisma.attendanceRecord.groupBy({
    by: ["studentId", "status"],
    where: { session: { academicYearId, sectionId: { in: sectionIds } } },
    _count: { _all: true },
  });

  const tally = new Map<number, { present: number; total: number }>();
  for (const row of rows) {
    const entry = tally.get(row.studentId) ?? { present: 0, total: 0 };
    entry.total += row._count._all;
    if (row.status === "PRESENT" || row.status === "LATE") entry.present += row._count._all;
    tally.set(row.studentId, entry);
  }
  for (const [studentId, { present, total }] of tally) {
    if (total > 0) percent.set(studentId, Math.round((present / total) * 100));
  }
  return percent;
}

/// The preview. Reads only.
export async function planRollover(
  sourceYearId: number,
  targetYearId: number,
  options: RolloverOptions,
): Promise<RolloverPlan> {
  const snapshot = await loadSnapshot(sourceYearId, targetYearId, options.markOrderExamTermId);
  return buildPlan(snapshot, options).plan;
}
```

`AttendanceStatus` is `PRESENT | ABSENT | LATE | LEAVE`; counting `PRESENT` and `LATE` as present is deliberate — a late student was in the room.

- [ ] **Step 4: Run the test to verify it passes**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/rollover.integration.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/rollover.ts src/lib/registry/rollover.integration.test.ts
git commit -m "feat(rollover): load the snapshot and preview a plan"
```

---

### Task 5: `applyRollover`

**Files:**
- Modify: `src/lib/registry/rollover.ts`
- Test: `src/lib/registry/rollover.integration.test.ts`

**Interfaces:**
- Consumes: `loadSnapshot`, `buildPlan`, `RolloverError`.
- Produces: `applyRollover(sourceYearId, targetYearId, options): Promise<RolloverPlan>` — returns the plan it actually applied. Task 9's `runRollover` action calls it.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/registry/rollover.integration.test.ts` (and add `applyRollover` to the import from `./rollover`):

```ts
describe.skipIf(!process.env.DB_TESTS)("rollover apply", () => {
  it("writes the structure and the enrolments in one pass", async () => {
    const plan = await applyRollover(made.sourceYearId, made.targetYearId, options());

    expect(plan.sections.create).toBe(4);

    const [sections, offerings, assignments, periods, enrollments] = await Promise.all([
      prisma.section.count({ where: { academicYearId: made.targetYearId } }),
      prisma.subjectOffering.count({ where: { academicYearId: made.targetYearId } }),
      prisma.teacherAssignment.count({
        where: { section: { academicYearId: made.targetYearId } },
      }),
      prisma.timetablePeriod.count({ where: { section: { academicYearId: made.targetYearId } } }),
      prisma.enrollment.count({ where: { academicYearId: made.targetYearId } }),
    ]);

    expect(sections).toBe(4);
    expect(offerings).toBe(1);
    expect(assignments).toBe(1);
    expect(periods).toBe(1);
    expect(enrollments).toBe(2);
  });

  it("carries the class teacher onto the copied section", async () => {
    const section = await prisma.section.findFirst({
      where: { academicYearId: made.targetYearId, name: "A", grade: { name: LOWER } },
    });

    expect(section?.classTeacherId).toBe(made.staffIds[0]);
  });

  it("numbers the promoted students 1..n in the new section", async () => {
    const rolls = await prisma.enrollment.findMany({
      where: { academicYearId: made.targetYearId },
      include: { student: { select: { fullName: true } } },
      orderBy: { rollNo: "asc" },
    });

    expect(rolls.map((r) => [r.student.fullName, r.rollNo])).toEqual([
      ["Anisha Gurung", 1],
      ["Zenith Rai", 2],
    ]);
  });

  it("creates nothing on a second run", async () => {
    const plan = await applyRollover(made.sourceYearId, made.targetYearId, options());

    expect(plan.sections).toMatchObject({ create: 0, existing: 4 });
    expect(plan.offerings).toMatchObject({ create: 0, existing: 1 });
    expect(plan.assignments).toMatchObject({ create: 0, existing: 1 });
    expect(plan.timetable).toMatchObject({ create: 0, existing: 1 });
    expect(await prisma.enrollment.count({ where: { academicYearId: made.targetYearId } })).toBe(2);
  });

  it("refuses once the target year has attendance", async () => {
    const section = await prisma.section.findFirst({
      where: { academicYearId: made.targetYearId },
    });
    const session = await prisma.attendanceSession.create({
      data: {
        sectionId: section!.id,
        academicYearId: made.targetYearId,
        date: new Date("2035-04-15"),
      },
    });

    await expect(
      applyRollover(made.sourceYearId, made.targetYearId, options()),
    ).rejects.toThrow(/attendance or marks/);

    await prisma.attendanceSession.delete({ where: { id: session.id } });
  });

  it("graduates the top grade and leaves a departing student unenrolled", async () => {
    // A third student, in the upper grade, so promotion means graduation.
    const student = await prisma.student.create({
      data: {
        admissionNo: "__ro-top",
        firstName: "Top",
        lastName: "Leaver",
        fullName: "Top Leaver",
        dob: new Date("2010-01-01"),
        gender: "FEMALE",
        admittedOn: new Date("2023-01-01"),
      },
    });
    made.studentIds.push(student.id);
    const upperA = made.sectionIds[2]!;
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        sectionId: upperA,
        academicYearId: made.sourceYearId,
        rollNo: 1,
        enrolledOn: new Date("2023-01-01"),
      },
    });

    await applyRollover(made.sourceYearId, made.targetYearId, options());

    const after = await prisma.student.findUnique({ where: { id: student.id } });
    expect(after?.status).toBe("GRADUATED");
    expect(
      await prisma.enrollment.count({
        where: { studentId: student.id, academicYearId: made.targetYearId },
      }),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/rollover.integration.test.ts`
Expected: FAIL — `applyRollover is not a function` / import error.

- [ ] **Step 3: Implement the transaction**

Append to `src/lib/registry/rollover.ts`:

```ts
/// Runs the whole rollover as one unit. It re-plans from its own read rather
/// than trusting a plan posted from the browser, so a preview that has gone
/// stale cannot write stale rows.
export async function applyRollover(
  sourceYearId: number,
  targetYearId: number,
  options: RolloverOptions,
): Promise<RolloverPlan> {
  const snapshot = await loadSnapshot(sourceYearId, targetYearId, options.markOrderExamTermId);
  const { plan, writes } = buildPlan(snapshot, options);
  if (plan.blockers.length > 0) throw new RolloverError(plan.blockers[0]!);

  await prisma.$transaction(
    async (tx) => {
      // Sections first: every later stage addresses its rows through them.
      const sectionIdByKey = new Map(
        snapshot.targetSections.map((s) => [sectionKey(s.gradeId, s.name), s.id] as const),
      );
      for (const s of writes.sections) {
        const created = await tx.section.create({
          data: {
            name: s.name,
            gradeId: s.gradeId,
            academicYearId: targetYearId,
            classTeacherId: s.classTeacherId,
          },
        });
        sectionIdByKey.set(s.key, created.id);
      }

      const offeringIdByKey = new Map<string, number>();
      const existingOfferings = await tx.subjectOffering.findMany({
        where: { academicYearId: targetYearId },
      });
      for (const o of existingOfferings) {
        offeringIdByKey.set(offeringKey(o.subjectId, o.gradeId), o.id);
      }
      for (const o of writes.offerings) {
        const created = await tx.subjectOffering.create({
          data: {
            subjectId: o.subjectId,
            gradeId: o.gradeId,
            academicYearId: targetYearId,
            hasPractical: o.hasPractical,
            fullMarksTheory: o.fullMarksTheory,
            passMarksTheory: o.passMarksTheory,
            fullMarksPractical: o.fullMarksPractical,
            passMarksPractical: o.passMarksPractical,
          },
        });
        offeringIdByKey.set(o.key, created.id);
      }

      const assignmentIdByKey = new Map<string, number>();
      const existingAssignments = await tx.teacherAssignment.findMany({
        where: { section: { academicYearId: targetYearId } },
        include: { section: true, subjectOffering: true },
      });
      for (const a of existingAssignments) {
        assignmentIdByKey.set(
          assignmentKey(
            a.staffId,
            sectionKey(a.section.gradeId, a.section.name),
            offeringKey(a.subjectOffering.subjectId, a.subjectOffering.gradeId),
          ),
          a.id,
        );
      }
      for (const a of writes.assignments) {
        const sectionId = sectionIdByKey.get(a.sectionKey);
        const subjectOfferingId = offeringIdByKey.get(a.offeringKey);
        if (sectionId === undefined || subjectOfferingId === undefined) continue;
        const created = await tx.teacherAssignment.create({
          data: { staffId: a.staffId, sectionId, subjectOfferingId },
        });
        assignmentIdByKey.set(a.key, created.id);
      }

      for (const p of writes.periods) {
        const teacherAssignmentId = assignmentIdByKey.get(p.assignmentKey);
        const sectionId = sectionIdByKey.get(p.sectionKey);
        if (teacherAssignmentId === undefined || sectionId === undefined) continue;
        await tx.timetablePeriod.create({
          data: {
            teacherAssignmentId,
            sectionId,
            schoolPeriodId: p.schoolPeriodId,
            dayOfWeek: p.dayOfWeek,
            room: p.room,
          },
        });
      }

      // One date for the whole run, so a rolled-over cohort reads as one event.
      const enrolledOn = new Date();
      for (const e of writes.enrollments) {
        const sectionId = sectionIdByKey.get(e.sectionKey);
        if (sectionId === undefined) continue;
        await tx.enrollment.create({
          data: {
            studentId: e.studentId,
            sectionId,
            academicYearId: targetYearId,
            rollNo: e.rollNo,
            enrolledOn,
          },
        });
      }

      if (writes.graduateIds.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: writes.graduateIds } },
          data: { status: "GRADUATED" },
        });
      }
      if (writes.leaveIds.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: writes.leaveIds } },
          data: { status: "LEFT" },
        });
      }

      if (options.makeTargetCurrent) {
        await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
        await tx.academicYear.update({ where: { id: targetYearId }, data: { isCurrent: true } });
      }
    },
    // Hundreds of sequential inserts on a school-sized year; the default 5s
    // interactive limit is not enough.
    { timeout: 120_000, maxWait: 10_000 },
  );

  return plan;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/rollover.integration.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/rollover.ts src/lib/registry/rollover.integration.test.ts
git commit -m "feat(rollover): apply a plan in one transaction"
```

---

### Task 6: Route, capability and navigation

Small and standalone, so the page in Task 7 has somewhere to live and cannot be reached by a role that should not see it.

**Files:**
- Modify: `src/lib/auth/roles.ts`
- Modify: `src/app/dashboard/_components/nav-model.ts`
- Modify: `scripts/ui-smoke.cjs`
- Test: `src/lib/auth/roles.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the route `/dashboard/rollover` guarded by `manage:registry`, and a nav item with id `rollover`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/auth/roles.test.ts` — match the file's existing `describe` naming and import style:

```ts
describe("rollover route", () => {
  it("needs the registry capability", () => {
    expect(capabilityFor("/dashboard/rollover")).toBe("manage:registry");
  });

  it("is open to admin and office, closed to teachers", () => {
    expect(canByDefault("ADMIN", "manage:registry")).toBe(true);
    expect(canByDefault("OFFICE", "manage:registry")).toBe(true);
    expect(canByDefault("TEACHER", "manage:registry")).toBe(false);
  });
});
```

`capabilityFor` and `canByDefault` are already imported at the top of that file — no import change is needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/roles.test.ts`
Expected: FAIL — `expected null to be "manage:registry"`.

- [ ] **Step 3: Register the route and the nav entry**

In `src/lib/auth/roles.ts`, add to `ROUTE_CAPABILITY`, after the `/dashboard/teachers` line:

```ts
  { prefix: "/dashboard/rollover", capability: "manage:registry" },
```

In `src/app/dashboard/_components/nav-model.ts`, add `CalendarPlus` to the `lucide-react` import and append to the `timetable` group's `items`:

```ts
      { id: "rollover", label: "Next year", href: "/dashboard/rollover", icon: CalendarPlus },
```

Leave `MOBILE_IDS` alone — a once-a-year bulk write does not belong on the phone bar.

In `scripts/ui-smoke.cjs`, add `"dashboard/rollover",` to `ROUTES` after `"dashboard/timetable",`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/auth src/app/dashboard/_components/nav-model.test.ts`
Expected: PASS, including the two new cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts src/app/dashboard/_components/nav-model.ts scripts/ui-smoke.cjs
git commit -m "feat(rollover): register the route, capability and nav entry"
```

---

### Task 7: Server actions and the page shell with step 1

**Files:**
- Create: `src/app/dashboard/rollover/page.tsx`
- Create: `src/app/dashboard/rollover/actions.ts`
- Create: `src/app/dashboard/rollover/_components/rollover-workspace.tsx`
- Create: `src/app/dashboard/rollover/_components/year-step.tsx`

**Interfaces:**
- Consumes: `planRollover`, `applyRollover`, `RolloverError` from `@/lib/registry/rollover`; `RolloverOptions`, `RolloverPlan`, `StudentDecision` from `@/lib/registry/rollover-plan`.
- Produces: `previewRollover(input): Promise<{ plan?: RolloverPlan; error?: string }>` and `runRollover(input): Promise<{ plan?: RolloverPlan; error?: string }>`, both taking `{ sourceYearId, targetYearId, options }`. `RolloverWorkspace` owns the `RolloverOptions` state that Tasks 8 and 9 read and write.

- [ ] **Step 1: Write the actions**

Create `src/app/dashboard/rollover/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { applyRollover, planRollover, RolloverError } from "@/lib/registry/rollover";
import { createAcademicYear } from "@/lib/registry/academic-year";
import type { RolloverOptions, RolloverPlan } from "@/lib/registry/rollover-plan";

export type RolloverResult = { plan?: RolloverPlan; error?: string };

export type RolloverInput = {
  sourceYearId: number;
  targetYearId: number;
  options: RolloverOptions;
};

const PATH = "/dashboard/rollover";

// Server actions are public POST endpoints, so every one re-checks the session.
async function requireSession() {
  await requireCapability("manage:registry");
}

export async function previewRollover(input: RolloverInput): Promise<RolloverResult> {
  await requireSession();
  try {
    return { plan: await planRollover(input.sourceYearId, input.targetYearId, input.options) };
  } catch (e) {
    if (e instanceof RolloverError) return { error: e.message };
    throw e;
  }
}

export async function runRollover(input: RolloverInput): Promise<RolloverResult> {
  await requireSession();
  try {
    const plan = await applyRollover(input.sourceYearId, input.targetYearId, input.options);
    // Every year-scoped page reads different rows now.
    revalidatePath("/dashboard", "layout");
    revalidatePath(PATH);
    return { plan };
  } catch (e) {
    if (e instanceof RolloverError) return { error: e.message };
    throw e;
  }
}

export async function addTargetYear(nameBS: string): Promise<{ id?: number; error?: string }> {
  await requireSession();
  try {
    const year = await createAcademicYear({ nameBS });
    revalidatePath(PATH);
    return { id: year.id };
  } catch (e) {
    if (e instanceof RangeError) return { error: e.message };
    return { error: `Academic year ${nameBS} could not be created.` };
  }
}
```

- [ ] **Step 2: Write the page**

Create `src/app/dashboard/rollover/page.tsx`:

```tsx
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  getCurrentAcademicYear,
  listAcademicYearsWithSize,
} from "@/lib/registry/academic-year";
import { RolloverWorkspace } from "./_components/rollover-workspace";

export default async function RolloverPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/rollover");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No academic year is current"
        description="A rollover moves one year into the next, so there has to be a year to move out of. Set one on the Classes page."
        action={
          <Button render={<Link href="/dashboard/classes" />} nativeButton={false}>
            Open Classes
          </Button>
        }
      />
    );
  }

  const [years, examTerms] = await Promise.all([
    listAcademicYearsWithSize(),
    // `endsOn` is nullable, so the term's own order is the reliable sort.
    prisma.examTerm.findMany({
      where: { academicYearId: currentYear.id },
      orderBy: { order: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <RolloverWorkspace
      sourceYear={{ id: currentYear.id, nameBS: currentYear.nameBS }}
      years={years
        .filter((y) => y.id !== currentYear.id)
        .map((y) => ({
          id: y.id,
          nameBS: y.nameBS,
          sections: y.sections,
          enrollments: y.enrollments,
        }))}
      examTerms={examTerms}
    />
  );
}
```

- [ ] **Step 3: Write the workspace and step 1**

Create `src/app/dashboard/rollover/_components/rollover-workspace.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { PageFrame } from "@/components/ui/page-frame";
import { Segmented } from "@/components/ui/segmented";
import { useActionToast } from "@/components/ui/toast";
import type { RolloverOptions, RolloverPlan, StudentDecision } from "@/lib/registry/rollover-plan";
import { previewRollover, type RolloverResult } from "../actions";
import { YearStep } from "./year-step";

export type YearOption = { id: number; nameBS: string; sections: number; enrollments: number };

type Step = "year" | "students" | "review";

/// The whole flow's state lives here: three steps read and write one
/// RolloverOptions, so the preview and the run can never disagree about what
/// the operator asked for.
export function RolloverWorkspace({
  sourceYear,
  years,
  examTerms,
}: {
  sourceYear: { id: number; nameBS: string };
  years: YearOption[];
  examTerms: { id: number; name: string }[];
}) {
  const [step, setStep] = useState<Step>("year");
  const [targetYearId, setTargetYearId] = useState<number | null>(years[0]?.id ?? null);
  const [options, setOptions] = useState<RolloverOptions>({
    copyOfferings: true,
    copyAssignments: true,
    copyTimetable: true,
    rollOrder: "ALPHABETICAL",
    markOrderExamTermId: null,
    decisions: {},
    placements: {},
    makeTargetCurrent: false,
  });
  const [plan, setPlan] = useState<RolloverPlan | null>(null);
  const [result, setResult] = useState<RolloverResult>({});
  const [pending, startTransition] = useTransition();

  useActionToast({ error: result.error });

  const targetYear = years.find((y) => y.id === targetYearId) ?? null;

  const refresh = (next: RolloverOptions, then?: (plan: RolloverPlan) => void) => {
    if (targetYearId === null) return;
    startTransition(async () => {
      const outcome = await previewRollover({
        sourceYearId: sourceYear.id,
        targetYearId,
        options: next,
      });
      setResult(outcome);
      if (outcome.plan) {
        setPlan(outcome.plan);
        then?.(outcome.plan);
      }
    });
  };

  const update = (patch: Partial<RolloverOptions>) => {
    // Unticking a stage unticks whatever hangs off it: an assignment needs its
    // offering, a period needs its assignment.
    const merged = { ...options, ...patch };
    if (!merged.copyOfferings) merged.copyAssignments = false;
    if (!merged.copyAssignments) merged.copyTimetable = false;
    setOptions(merged);
    refresh(merged);
  };

  const setDecision = (studentId: number, decision: StudentDecision) => {
    update({ decisions: { ...options.decisions, [studentId]: decision } });
  };

  return (
    <PageFrame
      eyebrow="School"
      title="Next year"
      meta={targetYear ? `${sourceYear.nameBS} → ${targetYear.nameBS}` : sourceYear.nameBS}
    >
      <PageFrame.Toolbar>
        <Segmented
          value={step}
          onChange={setStep}
          ariaLabel="Rollover step"
          options={[
            { value: "year", label: "1. Year" },
            { value: "students", label: "2. Students" },
            { value: "review", label: "3. Review" },
          ]}
        />
      </PageFrame.Toolbar>

      <PageFrame.Body className="overflow-y-auto p-4">
        {step === "year" ? (
          <YearStep
            sourceYear={sourceYear}
            years={years}
            examTerms={examTerms}
            targetYearId={targetYearId}
            options={options}
            plan={plan}
            pending={pending}
            onTargetYear={(id) => {
              setTargetYearId(id);
              setPlan(null);
            }}
            onOptions={update}
            onContinue={() => setStep("students")}
          />
        ) : null}
        {/* Steps 2 and 3 arrive in the next two tasks. */}
      </PageFrame.Body>
    </PageFrame>
  );
}
```

Create `src/app/dashboard/rollover/_components/year-step.tsx`:

```tsx
"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/ui/page-shell";
import { FieldSelect } from "@/components/ui/select";
import { ROLL_ORDER_LABEL, isRollOrder } from "@/lib/registry/roll-order";
import type { RolloverOptions, RolloverPlan } from "@/lib/registry/rollover-plan";
import { addTargetYear } from "../actions";
import type { YearOption } from "./rollover-workspace";

export function YearStep({
  sourceYear,
  years,
  examTerms,
  targetYearId,
  options,
  plan,
  pending,
  onTargetYear,
  onOptions,
  onContinue,
}: {
  sourceYear: { id: number; nameBS: string };
  years: YearOption[];
  examTerms: { id: number; name: string }[];
  targetYearId: number | null;
  options: RolloverOptions;
  plan: RolloverPlan | null;
  pending: boolean;
  onTargetYear: (id: number) => void;
  onOptions: (patch: Partial<RolloverOptions>) => void;
  onContinue: () => void;
}) {
  const [newYear, setNewYear] = useState("");
  const [creating, setCreating] = useState(false);

  // The first preview needs no click: the operator should see the shape of the
  // run as soon as a target year is chosen.
  useEffect(() => {
    if (targetYearId !== null && plan === null && !pending) onOptions({});
  }, [targetYearId, plan, pending, onOptions]);

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-2">
        <Label htmlFor="target-year">Roll {sourceYear.nameBS} into</Label>
        <div className="flex gap-2">
          <FieldSelect
            id="target-year"
            aria-label="Target academic year"
            value={targetYearId === null ? "" : String(targetYearId)}
            // base-ui hands back null when a select is cleared.
            onValueChange={(value) => {
              if (value) onTargetYear(Number(value));
            }}
            placeholder="Choose a year"
            options={years.map((y) => ({
              value: String(y.id),
              label:
                y.sections === 0
                  ? `${y.nameBS} — empty`
                  : `${y.nameBS} — ${y.sections} section(s), ${y.enrollments} student(s)`,
            }))}
          />
        </div>
        <div className="flex items-end gap-2 pt-2">
          <div className="space-y-1">
            <Label htmlFor="new-year">Or create a year</Label>
            <Input
              id="new-year"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              placeholder={String(Number(sourceYear.nameBS) + 1)}
              inputMode="numeric"
              className="w-32 font-mono"
            />
          </div>
          <Button
            variant="secondary"
            disabled={creating || newYear.trim() === ""}
            onClick={async () => {
              setCreating(true);
              const made = await addTargetYear(newYear.trim());
              setCreating(false);
              if (made.id !== undefined) {
                setNewYear("");
                onTargetYear(made.id);
              }
            }}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-ink-3 text-[11px] font-medium tracking-[0.1em] uppercase">
          What to copy
        </p>
        <p className="text-ink-2 text-sm">
          Sections always copy — promoted students need somewhere to land.
        </p>
        {(
          [
            ["copyOfferings", "Subject offerings, with their full and pass marks"],
            ["copyAssignments", "Which teacher takes which subject in which section"],
            ["copyTimetable", "The weekly timetable"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={options[field]}
              onCheckedChange={(checked) => onOptions({ [field]: checked === true })}
            />
            {label}
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <Label htmlFor="roll-order">New roll numbers</Label>
        <FieldSelect
          id="roll-order"
          aria-label="Roll number order"
          value={options.rollOrder}
          onValueChange={(value) => {
            if (value && isRollOrder(value)) onOptions({ rollOrder: value });
          }}
          options={Object.entries(ROLL_ORDER_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {options.rollOrder === "MARKS" ? (
          <FieldSelect
            aria-label="Exam term for roll order"
            value={options.markOrderExamTermId === null ? "" : String(options.markOrderExamTermId)}
            onValueChange={(value) => {
              if (value) onOptions({ markOrderExamTermId: Number(value) });
            }}
            placeholder="Choose the exam term"
            options={examTerms.map((t) => ({ value: String(t.id), label: t.name }))}
          />
        ) : null}
      </section>

      {plan && plan.blockers.length > 0 ? (
        <Callout icon={AlertTriangle} tint="rose">
          <ul className="space-y-1">
            {plan.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {plan && plan.blockers.length === 0 ? (
        <Callout icon={Info} tint="blue">
          {plan.sections.create} section(s), {plan.offerings.create} offering(s),{" "}
          {plan.assignments.create} assignment(s) and {plan.timetable.create} timetable period(s)
          would be created.
        </Callout>
      ) : null}

      <Button disabled={targetYearId === null || pending} onClick={onContinue}>
        Continue to students
      </Button>
    </div>
  );
}
```

`Callout`'s tints are `violet | blue | green | amber | rose`; `FieldSelect` takes `value` / `onValueChange` / `options` / `placeholder` / `aria-label`, as `classes-view.tsx:218` already uses it.

- [ ] **Step 4: Typecheck and look at the page**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

Then start `next dev`, sign in, and open `/dashboard/rollover`. Step 1 should list years, take a target, and show a preview callout. (There is no seeded login: insert a temporary ADMIN user with a bcryptjs hash and delete it afterwards.)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/rollover
git commit -m "feat(rollover): page shell, actions and the year step"
```

---

### Task 8: Step 2 — the student decisions

**Files:**
- Create: `src/app/dashboard/rollover/_components/students-step.tsx`
- Modify: `src/app/dashboard/rollover/_components/rollover-workspace.tsx`

**Interfaces:**
- Consumes: `plan.students` and `setDecision` from `RolloverWorkspace`; `StudentAvatar` and `initialsOf` from `@/components/ui/student-avatar`.
- Produces: `StudentsStep`, rendered when `step === "students"`.

- [ ] **Step 1: Write the component**

Create `src/app/dashboard/rollover/_components/students-step.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { StudentAvatar } from "@/components/ui/student-avatar";
import type { PlannedStudent, RolloverPlan, StudentDecision } from "@/lib/registry/rollover-plan";

type Row = PlannedStudent & { decision: StudentDecision; toLabel: string | null };

/// Every student the run touches, grouped by the section they are in now, so
/// the office reads it the same way they read a register.
export function StudentsStep({
  plan,
  onDecision,
  onBulk,
  onContinue,
}: {
  plan: RolloverPlan;
  onDecision: (studentId: number, decision: StudentDecision) => void;
  onBulk: (studentIds: number[], decision: StudentDecision) => void;
  onContinue: () => void;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(
    () => [
      ...plan.students.promote.map((s) => ({ ...s, decision: "PROMOTE" as const, toLabel: s.toLabel })),
      ...plan.students.retain.map((s) => ({ ...s, decision: "RETAIN" as const, toLabel: s.toLabel })),
      ...plan.students.graduate.map((s) => ({ ...s, decision: "PROMOTE" as const, toLabel: null })),
      ...plan.students.leave.map((s) => ({ ...s, decision: "LEFT" as const, toLabel: null })),
    ],
    [plan],
  );

  const groups = useMemo(() => {
    const map = new Map<number, { label: string; rows: Row[] }>();
    for (const row of rows) {
      const group = map.get(row.fromSectionId) ?? { label: row.fromLabel, rows: [] };
      group.rows.push(row);
      map.set(row.fromSectionId, group);
    }
    for (const group of map.values()) {
      group.rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const visible = groups
    .map((g) => ({
      ...g,
      rows: needle ? g.rows.filter((r) => r.fullName.toLowerCase().includes(needle)) : g.rows,
    }))
    .filter((g) => g.rows.length > 0);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No students to move"
        description={`Academic year ${plan.sourceYear.nameBS} has no active enrolments, so this rollover only copies structure.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students"
          className="max-w-xs"
          aria-label="Search students"
        />
        <Button className="ml-auto" onClick={onContinue}>
          Continue to review
        </Button>
      </div>

      {visible.map((group) => {
        const ids = group.rows.map((r) => r.studentId);
        // Nothing above the top grade, so Promote here means graduate.
        const graduating = group.rows.every((r) => r.toLabel === null && r.decision !== "LEFT");
        return (
          <section key={group.label} className="border-line bg-surface rounded-[10px] border">
            <header className="border-line flex items-center gap-3 border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">{group.label}</h2>
              <span className="text-ink-3 font-mono text-xs">{group.rows.length}</span>
              {graduating ? (
                <span className="text-ink-3 text-xs">leaving school</span>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button size="xs" variant="ghost" onClick={() => onBulk(ids, "PROMOTE")}>
                  All promote
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onBulk(ids, "RETAIN")}>
                  All retain
                </Button>
              </div>
            </header>

            <ul className="divide-line divide-y">
              {group.rows.map((row) => (
                <li key={row.studentId} className="flex items-center gap-3 px-4 py-2">
                  <StudentAvatar
                    photoId={row.photoId}
                    name={row.fullName}
                    className="size-8 rounded-lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{row.fullName}</p>
                    <p className="text-ink-3 font-mono text-xs">{row.admissionNo}</p>
                  </div>
                  <p className="text-ink-3 ml-4 w-28 font-mono text-xs tabular-nums">
                    {row.total === null ? "no marks" : `${row.total} marks`}
                  </p>
                  <p className="text-ink-3 w-20 font-mono text-xs tabular-nums">
                    {row.attendancePercent === null ? "—" : `${row.attendancePercent}%`}
                  </p>
                  <p className="text-ink-2 ml-auto w-32 truncate text-right text-xs">
                    {row.decision === "LEFT"
                      ? "leaving"
                      : (row.toLabel ?? "graduating")}
                  </p>
                  <Segmented
                    value={row.decision}
                    onChange={(next) => onDecision(row.studentId, next)}
                    ariaLabel={`What happens to ${row.fullName}`}
                    options={[
                      { value: "PROMOTE", label: graduating ? "Graduate" : "Promote" },
                      { value: "RETAIN", label: "Retain" },
                      { value: "LEFT", label: "Left" },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the workspace**

In `rollover-workspace.tsx`, import `StudentsStep`, add a bulk helper, and render the step:

```tsx
  const setBulk = (studentIds: number[], decision: StudentDecision) => {
    const decisions = { ...options.decisions };
    for (const id of studentIds) decisions[id] = decision;
    update({ decisions });
  };
```

```tsx
        {step === "students" && plan ? (
          <StudentsStep
            plan={plan}
            onDecision={setDecision}
            onBulk={setBulk}
            onContinue={() => setStep("review")}
          />
        ) : null}
```

- [ ] **Step 3: Typecheck, lint and look at it**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

In the browser: step 2 lists every enrolled student grouped by class; flipping one to Retain re-previews and its destination changes to the same class; *All retain* flips a whole group.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/rollover/_components
git commit -m "feat(rollover): student decisions step"
```

---

### Task 9: Step 3 — review, resolve and run

**Files:**
- Create: `src/app/dashboard/rollover/_components/review-step.tsx`
- Modify: `src/app/dashboard/rollover/_components/rollover-workspace.tsx`

**Interfaces:**
- Consumes: `plan`, `options`, `runRollover` from `../actions`.
- Produces: `ReviewStep`. This is the last piece; after it the flow writes.

- [ ] **Step 1: Write the component**

Create `src/app/dashboard/rollover/_components/review-step.tsx`:

```tsx
"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kpi } from "@/components/ui/kpi";
import { Callout } from "@/components/ui/page-shell";
import { FieldSelect } from "@/components/ui/select";
import type { RolloverOptions, RolloverPlan, StageCount } from "@/lib/registry/rollover-plan";

function stage(count: StageCount) {
  return count.existing === 0 && count.skipped === 0
    ? undefined
    : [
        count.existing > 0 ? `${count.existing} already there` : null,
        count.skipped > 0 ? `${count.skipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(" · ");
}

/// The last screen before anything is written. Everything it shows comes from
/// the same plan the server will rebuild, so there are no surprises.
export function ReviewStep({
  plan,
  options,
  pending,
  done,
  onOptions,
  onPlacement,
  onRun,
}: {
  plan: RolloverPlan;
  options: RolloverOptions;
  pending: boolean;
  done: boolean;
  onOptions: (patch: Partial<RolloverOptions>) => void;
  onPlacement: (sourceSectionId: number, targetSectionId: number) => void;
  onRun: () => void;
}) {
  const blocked = plan.blockers.length > 0;

  if (done) {
    return (
      <Callout icon={CheckCircle2} tint="green">
        Academic year {plan.targetYear.nameBS} is ready: {plan.sections.create} section(s),{" "}
        {plan.students.promote.length} promoted, {plan.students.retain.length} retained,{" "}
        {plan.students.graduate.length} graduated.
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={plan.sections.create} label="Sections" hint={stage(plan.sections)} />
        <Kpi value={plan.offerings.create} label="Offerings" hint={stage(plan.offerings)} />
        <Kpi value={plan.assignments.create} label="Assignments" hint={stage(plan.assignments)} />
        <Kpi value={plan.timetable.create} label="Periods" hint={stage(plan.timetable)} />
        <Kpi value={plan.students.promote.length} label="Promoting" />
        <Kpi value={plan.students.retain.length} label="Retaining" />
        <Kpi value={plan.students.graduate.length} label="Graduating" />
        <Kpi value={plan.students.leave.length} label="Leaving" />
      </div>

      {plan.unplaceable.map((group) => (
        <div key={group.sourceSectionId} className="border-line bg-surface rounded-[10px] border p-4">
          <p className="text-sm">
            {group.label} has {group.count} student(s) and no matching section in the grade above.
            Choose where they go.
          </p>
          <div className="pt-2">
            <FieldSelect
              aria-label={`Where ${group.label} goes`}
              value={
                options.placements[group.sourceSectionId] === undefined
                  ? ""
                  : String(options.placements[group.sourceSectionId])
              }
              onValueChange={(value) => {
                if (value) onPlacement(group.sourceSectionId, Number(value));
              }}
              placeholder={
                group.choices.length === 0 ? "No sections in that grade yet" : "Choose a section"
              }
              options={group.choices.map((c) => ({ value: String(c.id), label: c.label }))}
            />
          </div>
        </div>
      ))}

      {blocked ? (
        <Callout icon={AlertTriangle} tint="rose">
          <ul className="space-y-1">
            {plan.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox
          checked={options.makeTargetCurrent}
          onCheckedChange={(checked) => onOptions({ makeTargetCurrent: checked === true })}
        />
        Make {plan.targetYear.nameBS} the current year straight away
      </label>

      <Button disabled={blocked || pending} onClick={onRun}>
        {pending ? "Rolling over…" : `Roll ${plan.sourceYear.nameBS} into ${plan.targetYear.nameBS}`}
      </Button>
    </div>
  );
}
```

The confirm dialog: wrap the run button in the project's `Modal` (`src/components/ui/modal.tsx`) or reuse `ConfirmSubmit` if its two-click arming reads well enough here. Read both first and pick the one that already matches how the app confirms a heavy action; do not add a third pattern.

- [ ] **Step 2: Wire it into the workspace**

In `rollover-workspace.tsx`, add `done` state, a placement setter and the run handler:

```tsx
  const [done, setDone] = useState(false);

  const setPlacement = (sourceSectionId: number, targetSectionId: number) => {
    update({ placements: { ...options.placements, [sourceSectionId]: targetSectionId } });
  };

  const run = () => {
    if (targetYearId === null) return;
    startTransition(async () => {
      const outcome = await runRollover({
        sourceYearId: sourceYear.id,
        targetYearId,
        options,
      });
      setResult(outcome);
      if (outcome.plan) {
        setPlan(outcome.plan);
        setDone(true);
      }
    });
  };
```

```tsx
        {step === "review" && plan ? (
          <ReviewStep
            plan={plan}
            options={options}
            pending={pending}
            done={done}
            onOptions={update}
            onPlacement={setPlacement}
            onRun={run}
          />
        ) : null}
```

Import `runRollover` alongside `previewRollover`.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 4: Run it end to end against the database**

In the browser, roll the current year into a fresh year. Then check the result:

Run: `npx prisma studio` (or a `psql` query) and confirm the new year holds the sections, offerings, assignments, periods and enrolments the review screen promised. Switch the year in the header and open Classes, Subjects, Teaching, Timetable and Students in the new year.

Then run the flow a second time and confirm the review screen reports everything as already there and creates nothing.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/rollover/_components
git commit -m "feat(rollover): review step and the run"
```

---

### Task 10: The year switcher entry point and full verification

**Files:**
- Modify: `src/app/dashboard/_components/year-switcher.tsx`

**Interfaces:**
- Consumes: the route from Task 6.
- Produces: nothing further; this task closes the feature.

- [ ] **Step 1: Add the link**

Read `src/app/dashboard/_components/year-switcher.tsx`. It already links to `/dashboard/classes` when a year is empty. Beside that link, add one to `/dashboard/rollover` worded for the case — an empty year is usually one that has not been rolled into yet:

```tsx
        <Link href="/dashboard/rollover">Roll last year into it</Link>
```

Match the existing link's styling and surrounding markup exactly; do not introduce a new button variant.

- [ ] **Step 2: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. Note the count; it should be the previous total plus the 22 planner tests.

Run: `DB_TESTS=1 npx vitest run`
Expected: PASS, including the 9 rollover integration tests. Nothing in the other integration suites should have changed.

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint` then `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Screenshot the new page**

With `next dev` running and a temporary ADMIN login in place:

Run: `SMOKE_USER=... SMOKE_PASS=... npm run smoke`
Expected: `artifacts/smoke/` gains `dashboard-rollover` shots at 1440, 1000 and 390 in both themes. Check the 390 shots — step 2's row is wide, and the decision control must not overflow. If it does, stack the row on small screens before finishing.

Delete the temporary user afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_components/year-switcher.tsx
git commit -m "feat(rollover): reach the flow from an empty year"
```
