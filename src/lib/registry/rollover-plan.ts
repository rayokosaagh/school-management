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
