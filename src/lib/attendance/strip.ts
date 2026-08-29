import type { AttendanceStatus } from "@/generated/prisma/enums";

/// How one day reads in a strip. Defined here, next to the code that derives
/// it, rather than in the component that draws it.
export type DayStatus = "present" | "absent" | "late" | "none";

/// Total over the enum, so a new AttendanceStatus is a type error here rather
/// than a silent "none" in every strip.
const STATUS_TO_DAY: Record<AttendanceStatus, DayStatus> = {
  PRESENT: "present",
  LATE: "late",
  ABSENT: "absent",
  LEAVE: "absent",
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/// One entry per requested day, oldest first. Days the student has no record
/// for read as "none" — the section may not have taken roll that day.
export function stripFromCalendar(records: { date: Date; status: string }[], days: Date[]): DayStatus[] {
  const byDay = new Map(records.map((r) => [dayKey(r.date), STATUS_TO_DAY[r.status as AttendanceStatus]]));
  return days.map((day) => byDay.get(dayKey(day)) ?? "none");
}

/// Present and late both count as attended, matching monthlyRegister.
export function attendancePercent(records: { status: string }[]): number | null {
  if (records.length === 0) return null;
  const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  return Math.round((attended / records.length) * 100);
}

/// `count` UTC-midnight dates ending on `end`'s day, oldest first — the same
/// shape as AttendanceSession.date, so the list can be used in a `date: { in }`.
/// Lives here rather than in dashboard/overview to keep attendance free of a
/// circular import (overview already imports attendance).
export function lastDays(end: Date, count: number): Date[] {
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: count }, (_, i) => new Date(last - (count - 1 - i) * 86_400_000));
}
