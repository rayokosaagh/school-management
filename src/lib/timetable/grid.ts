import { prisma } from "@/lib/prisma";
import { toneForRank } from "./schedule";

// Reads for the section-first editor. A cell is (section, day, bell period);
// what fills it is a subject, and the teacher follows from the assignment the
// Teaching page already made.

export type GridOption = {
  subjectOfferingId: number;
  subjectName: string;
  /// Which --subject-N the grid paints this subject with.
  tone: number;
  /// Null when the grade is taught this subject but nobody has been given it
  /// yet. Kept in the list rather than hidden, so the gap is visible and the
  /// grid can say why the option cannot be picked.
  staffId: number | null;
  staffName: string | null;
};

export type GridCell = {
  /// The lesson's own id, not the bell slot's.
  id: number;
  dayOfWeek: number;
  schoolPeriodId: number;
  subjectOfferingId: number;
  subjectName: string;
  tone: number;
  staffId: number;
  staffName: string;
  room: string;
};

export type SectionGrid = {
  section: { id: number; name: string; gradeName: string; label: string };
  cells: GridCell[];
  options: GridOption[];
};

/// Subject id -> colour tone, ranked by the order the school created its
/// subjects. Ordered by id rather than by name so adding a subject appends a
/// colour instead of shifting every existing one.
export async function subjectTones(): Promise<Map<number, number>> {
  const subjects = await prisma.subject.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return new Map(subjects.map((subject, rank) => [subject.id, toneForRank(rank)]));
}

export async function getSectionGrid(
  sectionId: number,
): Promise<SectionGrid | null> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      name: true,
      gradeId: true,
      academicYearId: true,
      grade: { select: { name: true } },
    },
  });
  if (!section) return null;

  const [offerings, assignments, lessons, tones] = await Promise.all([
    prisma.subjectOffering.findMany({
      where: { gradeId: section.gradeId, academicYearId: section.academicYearId },
      orderBy: { subject: { name: "asc" } },
      select: { id: true, subjectId: true, subject: { select: { name: true } } },
    }),
    prisma.teacherAssignment.findMany({
      where: { sectionId },
      select: {
        subjectOfferingId: true,
        staff: { select: { id: true, fullName: true } },
      },
    }),
    prisma.timetablePeriod.findMany({
      where: { sectionId },
      orderBy: [{ dayOfWeek: "asc" }, { schoolPeriod: { order: "asc" } }],
      select: {
        id: true,
        dayOfWeek: true,
        schoolPeriodId: true,
        room: true,
        assignment: {
          select: {
            subjectOfferingId: true,
            staff: { select: { id: true, fullName: true } },
            subjectOffering: {
              select: { subjectId: true, subject: { select: { name: true } } },
            },
          },
        },
      },
    }),
    subjectTones(),
  ]);

  const teacherFor = new Map(assignments.map((a) => [a.subjectOfferingId, a.staff]));

  return {
    section: {
      id: section.id,
      name: section.name,
      gradeName: section.grade.name,
      label: `${section.grade.name} ${section.name}`,
    },
    options: offerings.map((offering) => {
      const staff = teacherFor.get(offering.id) ?? null;
      return {
        subjectOfferingId: offering.id,
        subjectName: offering.subject.name,
        tone: tones.get(offering.subjectId) ?? 0,
        staffId: staff?.id ?? null,
        staffName: staff?.fullName ?? null,
      };
    }),
    cells: lessons.map((lesson) => ({
      id: lesson.id,
      dayOfWeek: lesson.dayOfWeek,
      schoolPeriodId: lesson.schoolPeriodId,
      subjectOfferingId: lesson.assignment.subjectOfferingId,
      subjectName: lesson.assignment.subjectOffering.subject.name,
      tone: tones.get(lesson.assignment.subjectOffering.subjectId) ?? 0,
      staffId: lesson.assignment.staff.id,
      staffName: lesson.assignment.staff.fullName,
      room: lesson.room,
    })),
  };
}

/// Where every teacher already is, outside one section. The grid greys a
/// subject whose teacher is booked elsewhere in that slot and says where —
/// which is the same rule setTimetableCell enforces, shown before the click
/// rather than after it.
export type Booking = {
  dayOfWeek: number;
  schoolPeriodId: number;
  staffId: number;
  /// The class they are in, for the disabled option's label.
  where: string;
};

export async function listBookings(
  academicYearId: number,
  exceptSectionId: number | null,
): Promise<Booking[]> {
  const lessons = await prisma.timetablePeriod.findMany({
    where: {
      section: { academicYearId },
      ...(exceptSectionId === null ? {} : { sectionId: { not: exceptSectionId } }),
    },
    select: {
      dayOfWeek: true,
      schoolPeriodId: true,
      section: { select: { name: true, grade: { select: { name: true } } } },
      assignment: { select: { staffId: true } },
    },
  });

  return lessons.map((lesson) => ({
    dayOfWeek: lesson.dayOfWeek,
    schoolPeriodId: lesson.schoolPeriodId,
    staffId: lesson.assignment.staffId,
    where: `${lesson.section.grade.name} ${lesson.section.name}`,
  }));
}

/// How many lessons each section has scheduled, for the tab counts. A section
/// missing from the map has none, which the strip shows as a gap rather than
/// as a quiet room.
export async function countFilledBySection(
  academicYearId: number,
): Promise<Map<number, number>> {
  const rows = await prisma.timetablePeriod.groupBy({
    by: ["sectionId"],
    where: { section: { academicYearId } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.sectionId, row._count._all]));
}
