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

  // Built alongside rollByStudent, in roll order, rather than re-derived from
  // placements afterward — the write rows should read 1..n down the section
  // the way the office's own register would, not in whatever order students
  // happened to appear in the source snapshot.
  const enrollments: RolloverWrites["enrollments"] = [];

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
      if (!p) continue;
      const rollNo = next++;
      rollByStudent.set(p.student.studentId, rollNo);
      enrollments.push({ studentId: p.student.studentId, sectionKey: key, rollNo });
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
