import type { Actor } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { periodIsCurrent, schoolTime } from "@/lib/timetable/schedule";

// The clock helpers moved to src/lib/timetable/schedule.ts when the grid needed
// them in the browser. Re-exported so this module stays the one place the
// dashboard imports from.
export { formatMinute, periodIsCurrent, schoolTime } from "@/lib/timetable/schedule";

export type TodayPeriod = {
  id: number;
  /// The bell slot's name — "Period 3" — which is how a teacher refers to it.
  periodName: string;
  startMinute: number;
  endMinute: number;
  subject: string;
  classSection: string;
  room: string;
  isCurrent: boolean;
};

/// The actor comes from the authenticated session. There is deliberately no
/// teacher-id parameter a caller could swap to inspect somebody else's day.
export async function getTeacherScheduleForToday(
  actor: Actor,
  academicYearId: number,
  now: Date,
): Promise<TodayPeriod[]> {
  if (actor.role !== "TEACHER" || actor.staffId === null) return [];

  const { dayOfWeek, minuteOfDay } = schoolTime(now);
  const periods = await prisma.timetablePeriod.findMany({
    where: {
      dayOfWeek,
      assignment: {
        staffId: actor.staffId,
        section: { academicYearId },
        subjectOffering: { academicYearId },
      },
    },
    orderBy: [{ schoolPeriod: { order: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      room: true,
      schoolPeriod: {
        select: { name: true, startMinute: true, endMinute: true },
      },
      assignment: {
        select: {
          section: {
            select: { name: true, grade: { select: { name: true } } },
          },
          subjectOffering: {
            select: { subject: { select: { name: true } } },
          },
        },
      },
    },
  });

  return periods.map((period) => ({
    id: period.id,
    periodName: period.schoolPeriod.name,
    startMinute: period.schoolPeriod.startMinute,
    endMinute: period.schoolPeriod.endMinute,
    subject: period.assignment.subjectOffering.subject.name,
    classSection: `${period.assignment.section.grade.name} ${period.assignment.section.name}`,
    room: period.room,
    isCurrent: periodIsCurrent(period.schoolPeriod, minuteOfDay),
  }));
}
