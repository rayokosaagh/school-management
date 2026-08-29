import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { sectionsMissingAttendance } from "@/lib/attendance/attendance";

// What the home page needs to say what the school should do today, rather than
// only how many of each thing exist.

export type TrendDay = { date: Date; present: number; marked: number };

/// Buckets attendance records into one entry per day, oldest first, with empty
/// days kept so the chart's gaps are real gaps and not a squeezed axis.
export function summariseTrend(
  records: { date: Date; status: string }[],
  days: Date[],
): TrendDay[] {
  const byDay = new Map<number, { present: number; marked: number }>();
  for (const day of days) byDay.set(day.getTime(), { present: 0, marked: 0 });

  for (const record of records) {
    const slot = byDay.get(record.date.getTime());
    if (!slot) continue;
    slot.marked += 1;
    if (record.status === "PRESENT" || record.status === "LATE") slot.present += 1;
  }

  return days.map((date) => ({ date, ...byDay.get(date.getTime())! }));
}

/// The last `count` days ending at `end`, as UTC midnights matching how
/// attendance dates are stored.
export function recentDays(end: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );
    day.setUTCDate(day.getUTCDate() - i);
    days.push(day);
  }
  return days;
}

/// Keyed on the UTC-midnight timestamp rather than the `Date` the caller
/// happens to hold: `cache()` compares arguments by identity, and the layout
/// and the page each build their own `new Date()`. With the day as a number
/// both hit the same entry, so one request runs these queries once.
const loadOverview = cache(async (academicYearId: number, dayMs: number) => {
  const day = new Date(dayMs);
  const days = recentDays(day, 14);

  const [
    students,
    staffTotal,
    staffActive,
    grades,
    sectionRows,
    subjects,
    offerings,
    assignments,
    exams,
    missingToday,
    absentToday,
    trendRecords,
  ] = await Promise.all([
    prisma.enrollment.count({ where: { academicYearId } }),
    prisma.staff.count(),
    prisma.staff.count({ where: { isActive: true } }),
    prisma.grade.count(),
    prisma.section.findMany({
      where: { academicYearId },
      orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
      include: {
        grade: true,
        _count: { select: { assignments: true } },
      },
    }),
    prisma.subject.count(),
    prisma.subjectOffering.findMany({
      where: { academicYearId },
      select: { gradeId: true },
    }),
    prisma.teacherAssignment.count({ where: { section: { academicYearId } } }),
    prisma.examTerm.findMany({
      where: { academicYearId },
      select: { id: true, name: true, isPublished: true },
    }),
    sectionsMissingAttendance(academicYearId, day),
    prisma.attendanceRecord.count({
      where: { status: "ABSENT", session: { academicYearId, date: day } },
    }),
    prisma.attendanceRecord.findMany({
      where: { session: { academicYearId, date: { in: days } } },
      select: { status: true, session: { select: { date: true } } },
    }),
  ]);

  // A section's subjects come from its grade, so the gap is per section.
  const offeringsByGrade = new Map<number, number>();
  for (const offering of offerings) {
    offeringsByGrade.set(offering.gradeId, (offeringsByGrade.get(offering.gradeId) ?? 0) + 1);
  }

  let unassignedSlots = 0;
  const sectionsWithoutTeacher: { id: number; label: string }[] = [];
  for (const section of sectionRows) {
    const expected = offeringsByGrade.get(section.gradeId) ?? 0;
    unassignedSlots += Math.max(0, expected - section._count.assignments);
    if (section.classTeacherId === null) {
      sectionsWithoutTeacher.push({
        id: section.id,
        label: `${section.grade.name} ${section.name}`,
      });
    }
  }

  return {
    counts: {
      students,
      staffTotal,
      staffActive,
      grades,
      sections: sectionRows.length,
      subjects,
      offerings: offerings.length,
      assignments,
    },
    today: {
      date: day,
      missingAttendance: missingToday.map((s) => ({
        id: s.id,
        label: `${s.grade.name} ${s.name}`,
      })),
      sectionsTotal: sectionRows.length,
      absent: absentToday,
    },
    gaps: {
      sectionsWithoutClassTeacher: sectionsWithoutTeacher,
      unassignedSlots,
      unpublishedExams: exams.filter((e) => !e.isPublished).length,
      examsTotal: exams.length,
    },
    trend: summariseTrend(
      trendRecords.map((r) => ({ date: r.session.date, status: r.status })),
      days,
    ),
  };
});

/// Everything the shell and the Overview page need to say what the school
/// should do today. De-duplicated per request — see `loadOverview`.
export function getSchoolOverview(academicYearId: number, today: Date) {
  return loadOverview(
    academicYearId,
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
}

export type SchoolOverview = Awaited<ReturnType<typeof getSchoolOverview>>;
