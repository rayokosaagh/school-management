import { describe, expect, it } from "vitest";

import { assignmentKey, buildPlan, sectionKey, type RolloverOptions, type RolloverSnapshot } from "./rollover-plan";

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
