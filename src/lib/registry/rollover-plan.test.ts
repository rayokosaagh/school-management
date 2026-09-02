import { describe, expect, it } from "vitest";

import {
  assignmentKey,
  buildPlan,
  sectionKey,
  type RolloverOptions,
  type RolloverSnapshot,
  type SnapshotStudent,
} from "./rollover-plan";

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

  // Regression guard: on the normal rollover path the target year is empty,
  // so choices built from snapshot.targetSections (rather than the sections
  // this run is about to create) were always [] and the blocker could never
  // be cleared from the UI. See rollover-plan.ts UnplaceableGroup.choices.
  it("offers the grade-above section this run is about to create as a choice, even into an empty target year", () => {
    const noClass6B = snapshot({
      sourceSections: [
        { id: 100, gradeId: 10, name: "A", classTeacherId: null },
        { id: 102, gradeId: 10, name: "B", classTeacherId: null },
        { id: 101, gradeId: 11, name: "A", classTeacherId: null },
      ],
      targetSections: [],
      students: [student(9, 102)],
    });
    const { plan } = buildPlan(noClass6B, options());

    expect(plan.unplaceable).toHaveLength(1);
    expect(plan.unplaceable[0]!.choices).not.toEqual([]);
    expect(plan.unplaceable[0]!.choices).toContainEqual({
      key: sectionKey(11, "A"),
      label: "Class 6 A",
    });
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
    const { plan, writes } = buildPlan(noSixB, options({ placements: { 100: sectionKey(11, "A") } }));

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
