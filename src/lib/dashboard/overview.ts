import { prisma } from "@/lib/prisma";
import { granted, loadGrants } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/scope";
import { unbilledMonthCount } from "@/lib/fees/fees";
import { getWorkingDays } from "@/lib/timetable/bell";

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

/// Calendar date at school, stored as UTC midnight like Prisma's @db.Date.
export function schoolDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

export type DashboardOverview = {
  scope: "teacher" | "school";
  schoolDay: boolean;
  access: {
    records: boolean; attendance: boolean; registry: boolean; marks: boolean;
    manageExams: boolean; fees: boolean; settings: boolean; timetable: boolean;
    announce: boolean;
  };
  counts: {
    students: number; staffTotal: number; staffActive: number; grades: number;
    sections: number; subjects: number; offerings: number; assignments: number;
  };
  sections: { id: number; label: string; students: number; isClassTeacher: boolean; attendanceTaken: boolean }[];
  today: { date: Date; missingAttendance: { id: number; label: string }[]; sectionsTotal: number; absent: number };
  gaps: { sectionsWithoutClassTeacher: { id: number; label: string }[]; unassignedSlots: number; unpublishedExams: number; examsTotal: number; unbilledMonths: number };
  personal: { attendanceTaken: number; conductRecorded: number; activitiesRecorded: number };
  trend: TrendDay[];
};

/// Always resolves the stored grants on the server. No shared data cache: a
/// teacher's linked staff identity and an office user's grants govern queries.
export async function getDashboardOverview(
  actor: Actor,
  academicYearId: number,
  now: Date,
): Promise<DashboardOverview> {
  const day = schoolDate(now);
  const days = recentDays(day, 14);
  const grants = await loadGrants();
  const teacher = actor.role === "TEACHER";
  const has = (capability: Parameters<typeof granted>[2]) => granted(grants, actor.role, capability);
  const access = {
    records: has("view:records"),
    attendance: has("take:attendance"),
    registry: !teacher && has("manage:registry"),
    marks: has("enter:marks"),
    manageExams: !teacher && has("manage:exams") && has("enter:marks"),
    fees: !teacher && has("manage:fees"),
    settings: !teacher && has("manage:settings"),
    timetable: teacher ? actor.staffId !== null : has("manage:timetable"),
    // Not barred to teachers the way registry and fees are: a head of
    // department who teaches is exactly who a school would give this to.
    announce: has("post:announcements"),
  };
  const overview: DashboardOverview = {
    scope: teacher ? "teacher" : "school", schoolDay: false, access,
    counts: { students: 0, staffTotal: 0, staffActive: 0, grades: 0, sections: 0, subjects: 0, offerings: 0, assignments: 0 },
    sections: [], today: { date: day, missingAttendance: [], sectionsTotal: 0, absent: 0 },
    gaps: { sectionsWithoutClassTeacher: [], unassignedSlots: 0, unpublishedExams: 0, examsTotal: 0, unbilledMonths: 0 },
    personal: { attendanceTaken: 0, conductRecorded: 0, activitiesRecorded: 0 },
    trend: summariseTrend([], days),
  };

  // An unlinked teacher has no personal scope. In particular, never pass a
  // null staffId to a query (that would match unassigned school records).
  if (teacher && actor.staffId === null) return overview;

  const [year, workingDays] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { startsOn: true, endsOn: true } }),
    getWorkingDays(),
  ]);
  if (!year) return overview;
  overview.schoolDay = day >= year.startsOn && day <= year.endsOn && workingDays.includes(day.getUTCDay());

  const canReadSections = access.records || access.attendance || access.registry || access.marks || access.timetable;
  const sectionRows = canReadSections ? await prisma.section.findMany({
    where: {
      academicYearId,
      ...(teacher ? { OR: [{ classTeacherId: actor.staffId }, { assignments: { some: { staffId: actor.staffId! } } }] } : {}),
    },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
    select: {
      id: true, name: true, gradeId: true, classTeacherId: true,
      grade: { select: { name: true } },
      _count: access.records || access.registry ? { select: {
        enrollments: access.records ? { where: { academicYearId } } : false,
        assignments: access.registry,
      } } : false,
    },
  }) : [];
  const sectionIds = sectionRows.map((s) => s.id);
  const sessionScope = { academicYearId, sectionId: { in: sectionIds } };
  const hasSections = sectionIds.length > 0;
  const canReadAttendance = access.attendance && hasSections;
  const canRecordConduct = has("record:conduct") && (!teacher || hasSections);
  const ownEntryScope = {
    academicYearId, date: day, recordedById: actor.userId,
    ...(teacher ? { student: { enrollments: { some: { academicYearId, sectionId: { in: sectionIds } } } } } : {}),
  };

  const [
    staffTotal,
    staffActive,
    grades,
    subjects,
    offerings,
    assignments,
    exams,
    sessions,
    absentToday,
    trendRecords,
    attendanceTaken,
    conductRecorded,
    activitiesRecorded,
    unbilledMonths,
  ] = await Promise.all([
    access.registry ? prisma.staff.count() : 0,
    access.registry ? prisma.staff.count({ where: { isActive: true } }) : 0,
    new Set(sectionRows.map((s) => s.gradeId)).size,
    access.registry ? prisma.subject.count() : 0,
    access.registry ? prisma.subjectOffering.findMany({
      where: { academicYearId },
      select: { gradeId: true },
    }) : [],
    teacher && hasSections ? prisma.teacherAssignment.count({ where: { staffId: actor.staffId!, section: { academicYearId, id: { in: sectionIds } } } })
      : access.registry ? prisma.teacherAssignment.count({ where: { section: { academicYearId } } }) : 0,
    access.manageExams ? prisma.examTerm.findMany({
      where: { academicYearId },
      select: { isPublished: true },
    }) : [],
    canReadAttendance ? prisma.attendanceSession.findMany({ where: { ...sessionScope, date: day }, select: { sectionId: true } }) : [],
    canReadAttendance ? prisma.attendanceRecord.count({
      where: { status: "ABSENT", session: { ...sessionScope, date: day } },
    }) : 0,
    canReadAttendance ? prisma.attendanceRecord.findMany({
      where: { session: { ...sessionScope, date: { in: days.filter((d) => d >= year.startsOn && d <= year.endsOn) } } },
      select: { status: true, session: { select: { date: true } } },
    }) : [],
    canReadAttendance && actor.staffId !== null ? prisma.attendanceSession.count({ where: { ...sessionScope, date: day, takenById: actor.staffId } }) : 0,
    canRecordConduct ? prisma.conductEntry.count({ where: ownEntryScope }) : 0,
    canRecordConduct ? prisma.activityEntry.count({ where: ownEntryScope }) : 0,
    // Months that arrived on a monthly fee plan and were never billed. Its own
    // small query rather than `feeWorkspace`, which walks every enrolment in
    // the year to build a page this panel only needs one number from.
    access.fees ? unbilledMonthCount(academicYearId, now) : 0,
  ]);

  // A section's subjects come from its grade, so the gap is per section.
  const offeringsByGrade = new Map<number, number>();
  for (const offering of offerings) {
    offeringsByGrade.set(offering.gradeId, (offeringsByGrade.get(offering.gradeId) ?? 0) + 1);
  }

  let unassignedSlots = 0;
  const sectionsWithoutTeacher: { id: number; label: string }[] = [];
  for (const section of access.registry ? sectionRows : []) {
    const expected = offeringsByGrade.get(section.gradeId) ?? 0;
    unassignedSlots += Math.max(0, expected - section._count.assignments);
    if (access.registry && section.classTeacherId === null) {
      sectionsWithoutTeacher.push({
        id: section.id,
        label: `${section.grade.name} ${section.name}`,
      });
    }
  }

  const taken = new Set(sessions.map((s) => s.sectionId));
  const sections = sectionRows.map((s) => ({
    id: s.id, label: `${s.grade.name} ${s.name}`,
    students: access.records ? s._count.enrollments : 0,
    isClassTeacher: actor.staffId !== null && s.classTeacherId === actor.staffId,
    attendanceTaken: taken.has(s.id),
  }));
  return {
    ...overview,
    sections,
    counts: {
      students: sections.reduce((sum, s) => sum + s.students, 0),
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
      missingAttendance: overview.schoolDay && access.attendance ? sections.filter((s) => !s.attendanceTaken).map(({ id, label }) => ({ id, label })) : [],
      sectionsTotal: sectionRows.length,
      absent: absentToday,
    },
    personal: { attendanceTaken, conductRecorded, activitiesRecorded },
    gaps: {
      sectionsWithoutClassTeacher: sectionsWithoutTeacher,
      unassignedSlots,
      unpublishedExams: exams.filter((e) => !e.isPublished).length,
      examsTotal: exams.length,
      unbilledMonths,
    },
    trend: summariseTrend(
      trendRecords.map((r) => ({ date: r.session.date, status: r.status })),
      days,
    ),
  };
}

export type SchoolOverview = DashboardOverview;
