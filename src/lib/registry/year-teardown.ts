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
  /// A year with attendance or marks has been taught in, so its delete needs
  /// the operator to type the year's name.
  taught: boolean;
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
    // Attendance or marks mean real teaching happened; copied structure alone
    // does not.
    taught: attendanceSessions > 0 || marks > 0,
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
