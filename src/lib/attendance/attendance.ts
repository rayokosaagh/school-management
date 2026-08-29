import { prisma } from "@/lib/prisma";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { adToBs, bsMonthLength, bsToAd } from "@/lib/date/bs";
import { lastDays, stripFromCalendar, type DayStatus } from "./strip";

export class AttendanceError extends Error {}

export type Entry = { studentId: number; status: AttendanceStatus; note?: string | null };

/// The roster for a section on a date, carrying whatever was already recorded.
/// `taken` is false when no roll call happened, which is not the same as everyone
/// being present.
export async function getSheet(sectionId: number, date: Date) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { grade: true, academicYear: true },
  });
  if (!section) throw new AttendanceError("That section no longer exists.");

  assertWithinYear(date, section.academicYear.startsOn, section.academicYear.endsOn);

  const [enrollments, session] = await Promise.all([
    prisma.enrollment.findMany({
      where: { sectionId, academicYearId: section.academicYearId },
      orderBy: { rollNo: "asc" },
      include: { student: { select: { id: true, fullName: true, status: true } } },
    }),
    prisma.attendanceSession.findUnique({
      where: { sectionId_date: { sectionId, date } },
      include: { records: true, takenBy: { select: { fullName: true } } },
    }),
  ]);

  const byStudent = new Map(session?.records.map((r) => [r.studentId, r]) ?? []);

  return {
    section,
    taken: Boolean(session),
    takenBy: session?.takenBy?.fullName ?? null,
    takenAt: session?.takenAt ?? null,
    rows: enrollments
      .filter((e) => e.student.status === "ACTIVE")
      .map((e) => ({
        studentId: e.student.id,
        fullName: e.student.fullName,
        rollNo: e.rollNo,
        status: (byStudent.get(e.student.id)?.status ?? "PRESENT") as AttendanceStatus,
        note: byStudent.get(e.student.id)?.note ?? null,
      })),
  };
}

function assertWithinYear(date: Date, startsOn: Date, endsOn: Date) {
  if (date < startsOn || date > endsOn) {
    throw new AttendanceError("That date falls outside the academic year.");
  }
}

/// Saving replaces the whole day rather than merging, so the sheet on screen is
/// exactly what ends up stored — no stale row survives a correction.
export async function saveSheet({
  sectionId,
  date,
  takenById,
  entries,
}: {
  sectionId: number;
  date: Date;
  takenById?: number | null;
  entries: Entry[];
}) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { academicYear: true },
  });
  if (!section) throw new AttendanceError("That section no longer exists.");

  assertWithinYear(date, section.academicYear.startsOn, section.academicYear.endsOn);

  // Only students actually enrolled in this section may appear on its sheet.
  const enrolled = await prisma.enrollment.findMany({
    where: { sectionId, academicYearId: section.academicYearId },
    select: { studentId: true },
  });
  const allowed = new Set(enrolled.map((e) => e.studentId));
  const stray = entries.find((e) => !allowed.has(e.studentId));
  if (stray) {
    throw new AttendanceError("A student on that sheet is not enrolled in this section.");
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.upsert({
      where: { sectionId_date: { sectionId, date } },
      create: {
        sectionId,
        date,
        academicYearId: section.academicYearId,
        takenById: takenById ?? null,
      },
      update: { takenById: takenById ?? null, takenAt: new Date() },
    });

    await tx.attendanceRecord.deleteMany({ where: { sessionId: session.id } });
    if (entries.length > 0) {
      await tx.attendanceRecord.createMany({
        data: entries.map((e) => ({
          sessionId: session.id,
          studentId: e.studentId,
          status: e.status,
          note: e.note || null,
        })),
      });
    }
    return session;
  });
}

/// Per-student totals for one Bikram Sambat month, which is how the register is
/// kept and reported.
export async function monthlyRegister(
  sectionId: number,
  bsYear: number,
  bsMonth: number,
) {
  const from = bsToAd({ year: bsYear, month: bsMonth, day: 1 });
  const to = bsToAd({
    year: bsYear,
    month: bsMonth,
    day: bsMonthLength(bsYear, bsMonth),
  });

  const sessions = await prisma.attendanceSession.findMany({
    where: { sectionId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    include: { records: { include: { student: { select: { id: true, fullName: true } } } } },
  });

  const totals = new Map<
    number,
    { fullName: string; present: number; absent: number; late: number; leave: number }
  >();

  for (const session of sessions) {
    for (const record of session.records) {
      const row = totals.get(record.studentId) ?? {
        fullName: record.student.fullName,
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
      };
      if (record.status === "PRESENT") row.present++;
      else if (record.status === "ABSENT") row.absent++;
      else if (record.status === "LATE") row.late++;
      else row.leave++;
      totals.set(record.studentId, row);
    }
  }

  return {
    from,
    to,
    daysTaken: sessions.length,
    // Late still counts as attending; only absence does not.
    rows: [...totals.entries()].map(([studentId, t]) => ({
      studentId,
      ...t,
      attended: t.present + t.late,
      percent:
        sessions.length === 0
          ? 0
          : Math.round(((t.present + t.late) / sessions.length) * 100),
    })),
  };
}

/// Which sections have not had a roll call on a date — the daily nag list.
export async function sectionsMissingAttendance(academicYearId: number, date: Date) {
  const [sections, sessions] = await Promise.all([
    prisma.section.findMany({
      where: { academicYearId },
      orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
      include: { grade: true },
    }),
    prisma.attendanceSession.findMany({
      where: { academicYearId, date },
      select: { sectionId: true },
    }),
  ]);

  const done = new Set(sessions.map((s) => s.sectionId));
  return sections.filter((s) => !done.has(s.id));
}

/// Absentees on a date, with a guardian phone — what the SMS step will read.
export async function absenteesOn(academicYearId: number, date: Date) {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      status: { in: ["ABSENT"] },
      session: { academicYearId, date },
    },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          guardians: {
            where: { isPrimary: true },
            take: 1,
            select: { fullName: true, phone: true },
          },
        },
      },
      session: { include: { section: { include: { grade: true } } } },
    },
  });

  return records.map((r) => ({
    studentId: r.student.id,
    fullName: r.student.fullName,
    section: `${r.session.section.grade.name} ${r.session.section.name}`,
    guardian: r.student.guardians[0] ?? null,
  }));
}

export function todayBsLabel(date: Date) {
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, "0")}-${String(bs.day).padStart(2, "0")}`;
}

export type DayCell = {
  /** Gregorian midnight UTC, the storage form. */
  date: Date;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  /** Share of the roll that attended, 0..1. Null when no roll call happened. */
  rate: number | null;
};

/// Day-by-day attendance for a section, for a calendar heatmap. Days with no
/// roll call are simply absent from the result, so the map can distinguish
/// "nobody came" from "nobody took the register".
export async function sectionCalendar(sectionId: number, from: Date, to: Date) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { sectionId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    include: { records: { select: { status: true } } },
  });

  return sessions.map<DayCell>((session) => {
    let present = 0, absent = 0, late = 0, leave = 0;
    for (const r of session.records) {
      if (r.status === "PRESENT") present++;
      else if (r.status === "ABSENT") absent++;
      else if (r.status === "LATE") late++;
      else leave++;
    }
    const total = session.records.length;
    return {
      date: session.date,
      present,
      absent,
      late,
      leave,
      total,
      rate: total === 0 ? null : (present + late) / total,
    };
  });
}

/// One student's own day-by-day record, for the heatmap on their profile.
export async function studentCalendar(studentId: number, from: Date, to: Date) {
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, session: { date: { gte: from, lte: to } } },
    orderBy: { session: { date: "asc" } },
    include: { session: { select: { date: true } } },
  });

  return records.map((r) => ({
    date: r.session.date,
    status: r.status,
    note: r.note,
  }));
}

/// Per-student strips for a table: the last `count` days ending at `end`,
/// built from one query over the year's sessions in that window.
export async function recentStudentStrips(
  academicYearId: number,
  end: Date,
  count: number,
): Promise<Map<number, DayStatus[]>> {
  const days = lastDays(end, count);
  const records = await prisma.attendanceRecord.findMany({
    where: { session: { academicYearId, date: { in: days } } },
    select: { studentId: true, status: true, session: { select: { date: true } } },
  });
  const byStudent = new Map<number, { date: Date; status: string }[]>();
  for (const r of records) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push({ date: r.session.date, status: r.status });
    byStudent.set(r.studentId, list);
  }
  const strips = new Map<number, DayStatus[]>();
  for (const [studentId, list] of byStudent) strips.set(studentId, stripFromCalendar(list, days));
  return strips;
}
