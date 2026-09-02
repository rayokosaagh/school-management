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
        // buildPlan preserves this order for the promote/retain list it produces
        // (it only re-sorts internally to hand out roll numbers), so an
        // unordered read here would leave the preview in arbitrary row order.
        orderBy: { student: { fullName: "asc" } },
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
