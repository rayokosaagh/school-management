import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class YearTeardownError extends Error {}

/// Bumped whenever the captured shape changes. A payload from another version
/// is refused rather than half-understood.
export const PAYLOAD_VERSION = 1;

/// Row counts per table, in the order the delete walks them, so the dialog and
/// the restore report can be read side by side.
export type YearCounts = {
  sections: number;
  offerings: number;
  assignments: number;
  periods: number;
  enrollments: number;
  examTerms: number;
  marks: number;
  attendanceSessions: number;
  attendanceRecords: number;
  conduct: number;
  activities: number;
};

export type YearSummary = {
  year: { id: number; nameBS: string; isCurrent: boolean };
  counts: YearCounts;
  /// True when the year holds any row at all — attendance and marks included,
  /// but also a bare section or enrolment with nothing recorded against it
  /// yet. Structure alone is worth protecting: a year can be deleted with a
  /// single click only when it is genuinely empty, so this — not whether
  /// teaching specifically happened — decides whether the operator must type
  /// the year's name.
  hasData: boolean;
};

export type RestorePayload = {
  version: number;
  year: { id: number; nameBS: string; startsOn: string; endsOn: string };
  sections: unknown[];
  offerings: unknown[];
  assignments: unknown[];
  periods: unknown[];
  enrollments: unknown[];
  examTerms: unknown[];
  marks: unknown[];
  attendanceSessions: unknown[];
  attendanceRecords: unknown[];
  conduct: unknown[];
  activities: unknown[];
};

const ZERO: YearCounts = {
  sections: 0, offerings: 0, assignments: 0, periods: 0, enrollments: 0,
  examTerms: 0, marks: 0, attendanceSessions: 0, attendanceRecords: 0,
  conduct: 0, activities: 0,
};

/// Everything the delete dialog needs to tell the truth before anything is
/// destroyed.
export async function summariseYear(academicYearId: number): Promise<YearSummary> {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new YearTeardownError("That academic year no longer exists.");

  const sectionIds = (
    await prisma.section.findMany({ where: { academicYearId }, select: { id: true } })
  ).map((s) => s.id);
  const termIds = (
    await prisma.examTerm.findMany({ where: { academicYearId }, select: { id: true } })
  ).map((t) => t.id);
  const sessionIds = (
    await prisma.attendanceSession.findMany({ where: { academicYearId }, select: { id: true } })
  ).map((s) => s.id);

  const [
    offerings, assignments, periods, enrollments, examTerms,
    marks, attendanceSessions, attendanceRecords, conduct, activities,
  ] = await Promise.all([
    prisma.subjectOffering.count({ where: { academicYearId } }),
    prisma.teacherAssignment.count({ where: { sectionId: { in: sectionIds } } }),
    prisma.timetablePeriod.count({ where: { sectionId: { in: sectionIds } } }),
    prisma.enrollment.count({ where: { academicYearId } }),
    prisma.examTerm.count({ where: { academicYearId } }),
    prisma.mark.count({ where: { examTermId: { in: termIds } } }),
    prisma.attendanceSession.count({ where: { academicYearId } }),
    prisma.attendanceRecord.count({ where: { sessionId: { in: sessionIds } } }),
    prisma.conductEntry.count({ where: { academicYearId } }),
    prisma.activityEntry.count({ where: { academicYearId } }),
  ]);

  const counts: YearCounts = {
    ...ZERO,
    sections: sectionIds.length,
    offerings, assignments, periods, enrollments, examTerms,
    marks, attendanceSessions, attendanceRecords, conduct, activities,
  };

  return {
    year: { id: year.id, nameBS: year.nameBS, isCurrent: year.isCurrent },
    // Any non-zero count is something a click could destroy permanently —
    // sections and enrolments included, not just attendance and marks.
    hasData: Object.values(counts).some((count) => count > 0),
    counts,
  };
}

/// Captures every row the delete is about to remove. Takes the transaction
/// client so the capture and the delete cannot be separated by another write.
export async function snapshotYear(
  tx: Prisma.TransactionClient,
  academicYearId: number,
): Promise<{ payload: RestorePayload; counts: YearCounts }> {
  const year = await tx.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new YearTeardownError("That academic year no longer exists.");

  const sections = await tx.section.findMany({ where: { academicYearId } });
  const sectionIds = sections.map((s) => s.id);
  const examTerms = await tx.examTerm.findMany({ where: { academicYearId } });
  const termIds = examTerms.map((t) => t.id);
  const attendanceSessions = await tx.attendanceSession.findMany({ where: { academicYearId } });
  const sessionIds = attendanceSessions.map((s) => s.id);

  const [offerings, assignments, periods, enrollments, marks, attendanceRecords, conduct, activities] =
    await Promise.all([
      tx.subjectOffering.findMany({ where: { academicYearId } }),
      tx.teacherAssignment.findMany({ where: { sectionId: { in: sectionIds } } }),
      tx.timetablePeriod.findMany({ where: { sectionId: { in: sectionIds } } }),
      tx.enrollment.findMany({ where: { academicYearId } }),
      tx.mark.findMany({ where: { examTermId: { in: termIds } } }),
      tx.attendanceRecord.findMany({ where: { sessionId: { in: sessionIds } } }),
      tx.conductEntry.findMany({ where: { academicYearId } }),
      tx.activityEntry.findMany({ where: { academicYearId } }),
    ]);

  const payload: RestorePayload = {
    version: PAYLOAD_VERSION,
    year: {
      id: year.id,
      nameBS: year.nameBS,
      startsOn: year.startsOn.toISOString(),
      endsOn: year.endsOn.toISOString(),
    },
    sections, offerings, assignments, periods, enrollments,
    examTerms, marks, attendanceSessions, attendanceRecords, conduct, activities,
  };

  const counts: YearCounts = {
    sections: sections.length,
    offerings: offerings.length,
    assignments: assignments.length,
    periods: periods.length,
    enrollments: enrollments.length,
    examTerms: examTerms.length,
    marks: marks.length,
    attendanceSessions: attendanceSessions.length,
    attendanceRecords: attendanceRecords.length,
    conduct: conduct.length,
    activities: activities.length,
  };

  return { payload, counts };
}

/// Removes a year and everything recorded in it, optionally capturing a restore
/// point first. Capture and delete share one transaction: a restore point must
/// never be a promise the delete has already broken.
export async function deleteYearWithData(
  academicYearId: number,
  options: { createRestorePoint: boolean; actorUserId: number | null },
): Promise<{ counts: YearCounts; restorePointId: number | null }> {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new YearTeardownError("That academic year no longer exists.");
  // Deleting the current year would leave the school with none, which blanks
  // every page in the app.
  if (year.isCurrent) {
    throw new YearTeardownError(
      `Academic year ${year.nameBS} is the current year. Switch to another year before deleting it.`,
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // Registry restore points do not capture finance records. Refuse the
      // operation explicitly rather than losing registrations or failing on
      // a foreign key after attempting the registry deletes.
      if (await tx.studentFeePlan.count({ where: { academicYearId } })) {
        throw new YearTeardownError("This year has service fee structures. Financial records must be retained; registry-only restore points cannot restore them.");
      }
      if (await tx.transportRegistration.count({ where: { enrollment: { academicYearId } } })) {
        throw new YearTeardownError("This year has transport registrations. Its financial records must be retained; registry-only restore points cannot restore them.");
      }
      const { payload, counts } = await snapshotYear(tx, academicYearId);

      let restorePointId: number | null = null;
      if (options.createRestorePoint) {
        const point = await tx.restorePoint.create({
          data: {
            yearNameBS: year.nameBS,
            startsOn: year.startsOn,
            endsOn: year.endsOn,
            createdById: options.actorUserId,
            counts,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        restorePointId = point.id;
      }

      const sectionIds = payload.sections.map((s) => (s as { id: number }).id);
      const termIds = payload.examTerms.map((t) => (t as { id: number }).id);
      const sessionIds = payload.attendanceSessions.map((s) => (s as { id: number }).id);

      // Children before parents. Some of these cascade from each other, but
      // each is deleted explicitly so the counts reported are the truth.
      await tx.attendanceRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.attendanceSession.deleteMany({ where: { academicYearId } });
      await tx.mark.deleteMany({ where: { examTermId: { in: termIds } } });
      await tx.examTerm.deleteMany({ where: { academicYearId } });
      await tx.conductEntry.deleteMany({ where: { academicYearId } });
      await tx.activityEntry.deleteMany({ where: { academicYearId } });
      await tx.enrollment.deleteMany({ where: { academicYearId } });
      await tx.timetablePeriod.deleteMany({ where: { sectionId: { in: sectionIds } } });
      await tx.teacherAssignment.deleteMany({ where: { sectionId: { in: sectionIds } } });
      await tx.section.deleteMany({ where: { academicYearId } });
      await tx.subjectOffering.deleteMany({ where: { academicYearId } });
      await tx.academicYear.delete({ where: { id: academicYearId } });

      return { counts, restorePointId };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
