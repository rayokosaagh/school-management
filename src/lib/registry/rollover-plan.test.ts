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
