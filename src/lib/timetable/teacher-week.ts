import { prisma } from "@/lib/prisma";
import { subjectTones } from "./grid";

// Read-only views over the same rows the section grid writes. Nothing here
// mutates: a teacher's week is the timetable seen down a different axis.

export type WeekPeriod = {
  id: number;
  dayOfWeek: number;
  schoolPeriodId: number;
  periodName: string;
  startMinute: number;
  endMinute: number;
  subject: string;
  tone: number;
  classSection: string;
  room: string;
};

export async function getTeacherWeek(
  staffId: number,
  academicYearId: number,
): Promise<WeekPeriod[]> {
  const [lessons, tones] = await Promise.all([
    prisma.timetablePeriod.findMany({
    where: {
      section: { academicYearId },
      assignment: { staffId },
    },
    orderBy: [{ dayOfWeek: "asc" }, { schoolPeriod: { order: "asc" } }],
    select: {
      id: true,
      dayOfWeek: true,
      schoolPeriodId: true,
      room: true,
      schoolPeriod: { select: { name: true, startMinute: true, endMinute: true } },
      section: { select: { name: true, grade: { select: { name: true } } } },
      assignment: {
        select: {
          subjectOffering: {
            select: { subjectId: true, subject: { select: { name: true } } },
          },
        },
      },
    },
    }),
    subjectTones(),
  ]);

  return lessons.map((lesson) => ({
    id: lesson.id,
    dayOfWeek: lesson.dayOfWeek,
    schoolPeriodId: lesson.schoolPeriodId,
    periodName: lesson.schoolPeriod.name,
    startMinute: lesson.schoolPeriod.startMinute,
    endMinute: lesson.schoolPeriod.endMinute,
    subject: lesson.assignment.subjectOffering.subject.name,
    tone: tones.get(lesson.assignment.subjectOffering.subjectId) ?? 0,
    classSection: `${lesson.section.grade.name} ${lesson.section.name}`,
    room: lesson.room,
  }));
}

export type Clash = {
  staffId: number;
  staffName: string;
  dayOfWeek: number;
  schoolPeriodId: number;
  periodName: string;
  /// Every class the teacher is booked into in that one slot.
  sections: { sectionId: number; label: string; subject: string }[];
};

/// setTimetableCell cannot create a clash, but setSubjectTeacher can: moving a
/// section's subject to a teacher who is already busy in that slot double-books
/// them after the fact. Blocking that would break an unrelated page with an
/// opaque error, so the timetable reports it instead.
export async function listTeacherClashes(
  academicYearId: number,
): Promise<Clash[]> {
  const lessons = await prisma.timetablePeriod.findMany({
    where: { section: { academicYearId } },
    orderBy: [{ dayOfWeek: "asc" }, { schoolPeriod: { order: "asc" } }],
    select: {
      dayOfWeek: true,
      schoolPeriodId: true,
      sectionId: true,
      schoolPeriod: { select: { name: true } },
      section: { select: { name: true, grade: { select: { name: true } } } },
      assignment: {
        select: {
          staff: { select: { id: true, fullName: true } },
          subjectOffering: { select: { subject: { select: { name: true } } } },
        },
      },
    },
  });

  const bySlot = new Map<string, Clash>();
  for (const lesson of lessons) {
    const staff = lesson.assignment.staff;
    const key = `${staff.id}:${lesson.dayOfWeek}:${lesson.schoolPeriodId}`;
    const entry = bySlot.get(key) ?? {
      staffId: staff.id,
      staffName: staff.fullName,
      dayOfWeek: lesson.dayOfWeek,
      schoolPeriodId: lesson.schoolPeriodId,
      periodName: lesson.schoolPeriod.name,
      sections: [],
    };
    entry.sections.push({
      sectionId: lesson.sectionId,
      label: `${lesson.section.grade.name} ${lesson.section.name}`,
      subject: lesson.assignment.subjectOffering.subject.name,
    });
    bySlot.set(key, entry);
  }

  return [...bySlot.values()].filter((entry) => entry.sections.length > 1);
}
