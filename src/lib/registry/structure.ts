import { prisma } from "@/lib/prisma";

// Grades and their sections. A grade is school-wide and outlives any one year;
// a section belongs to a grade *within* a year, because 5 'B' may exist in 2082
// and not in 2083.

export function listGrades() {
  return prisma.grade.findMany({ orderBy: { order: "asc" } });
}

export function createGrade({ name, order }: { name: string; order: number }) {
  return prisma.grade.create({ data: { name, order } });
}

/// Grades with the sections they run in one year, plus a live headcount.
export function listGradesWithSections(academicYearId: number) {
  return prisma.grade.findMany({
    orderBy: { order: "asc" },
    include: {
      sections: {
        where: { academicYearId },
        orderBy: { name: "asc" },
        include: {
          classTeacher: { select: { id: true, fullName: true } },
          _count: { select: { enrollments: true } },
        },
      },
    },
  });
}

export function listSections(academicYearId: number) {
  return prisma.section.findMany({
    where: { academicYearId },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
    include: { grade: true },
  });
}

export function createSection(input: {
  name: string;
  gradeId: number;
  academicYearId: number;
  classTeacherId?: number | null;
}) {
  return prisma.section.create({
    data: {
      name: input.name,
      gradeId: input.gradeId,
      academicYearId: input.academicYearId,
      classTeacherId: input.classTeacherId ?? null,
    },
  });
}

export function setClassTeacher(sectionId: number, classTeacherId: number | null) {
  return prisma.section.update({
    where: { id: sectionId },
    data: { classTeacherId },
  });
}

/// A section still holding enrollments must not vanish under them.
export async function deleteSection(sectionId: number) {
  const count = await prisma.enrollment.count({ where: { sectionId } });
  if (count > 0) {
    throw new Error(`Section has ${count} enrolled student(s). Move them first.`);
  }
  return prisma.section.delete({ where: { id: sectionId } });
}

export function updateGrade(id: number, data: { name: string; order: number }) {
  return prisma.grade.update({ where: { id }, data });
}

/// Sections and offerings hang off a grade; clear those before removing it.
export async function deleteGrade(id: number) {
  const [sections, offerings] = await Promise.all([
    prisma.section.count({ where: { gradeId: id } }),
    prisma.subjectOffering.count({ where: { gradeId: id } }),
  ]);
  if (sections + offerings > 0) {
    throw new Error(`Grade still has ${sections} section(s) and ${offerings} offering(s).`);
  }
  return prisma.grade.delete({ where: { id } });
}

export function renameSection(id: number, name: string) {
  return prisma.section.update({ where: { id }, data: { name } });
}

/// Swaps a grade with its neighbour in the ordering. `order` is unique, so the
/// pair cannot be written directly — the row being moved is parked on a value
/// below every existing one for the duration of the transaction.
export async function moveGrade(id: number, direction: "up" | "down") {
  const grade = await prisma.grade.findUnique({ where: { id } });
  if (!grade) throw new Error("That grade no longer exists.");

  const neighbour = await prisma.grade.findFirst({
    where:
      direction === "up" ? { order: { lt: grade.order } } : { order: { gt: grade.order } },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  // Already at the top or bottom; nothing to swap with.
  if (!neighbour) return null;

  const lowest = await prisma.grade.aggregate({ _min: { order: true } });
  const parking = (lowest._min.order ?? 0) - 1;

  return prisma.$transaction(async (tx) => {
    await tx.grade.update({ where: { id: grade.id }, data: { order: parking } });
    await tx.grade.update({ where: { id: neighbour.id }, data: { order: grade.order } });
    return tx.grade.update({ where: { id: grade.id }, data: { order: neighbour.order } });
  });
}

/// Rewrites orders to 0,1,2,… in their current sequence, closing any gaps left
/// by deletions so the move buttons always have a neighbour to swap with.
export async function normaliseGradeOrder() {
  const grades = await prisma.grade.findMany({ orderBy: { order: "asc" } });
  const lowest = await prisma.grade.aggregate({ _min: { order: true } });
  let parking = (lowest._min.order ?? 0) - 1;

  return prisma.$transaction(async (tx) => {
    // Park everything out of the way first, or the rewrite collides with itself.
    for (const grade of grades) {
      await tx.grade.update({ where: { id: grade.id }, data: { order: parking-- } });
    }
    for (const [index, grade] of grades.entries()) {
      await tx.grade.update({ where: { id: grade.id }, data: { order: index } });
    }
    return grades.length;
  });
}

export function getSection(id: number) {
  return prisma.section.findUnique({ where: { id } });
}
