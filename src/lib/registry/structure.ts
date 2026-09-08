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
          classTeacher: { select: { id: true, fullName: true, fullNameNp: true } },
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
/// Where to park rows while `order` is rewritten. `order` is unique, so every
/// row moves out of the way before any real value is written. The floor has to
/// sit below every existing order *and* below the 0…n-1 range about to be
/// written: the current minimum alone is not low enough when it is already a
/// small positive number (say the grades sit at 3,4,5 after earlier deletions),
/// because parking at 2,1,0 collides with the values the rewrite then uses.
export function parkingFloor(lowestOrder: number | null): number {
  return Math.min(lowestOrder ?? 0, 0) - 1;
}

export async function normaliseGradeOrder() {
  const grades = await prisma.grade.findMany({ orderBy: { order: "asc" } });
  const lowest = await prisma.grade.aggregate({ _min: { order: true } });
  let parking = parkingFloor(lowest._min.order);

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

/// Split out from `reorderGrades` so the rejection rules can be unit-tested
/// without a database: a partial or malformed list would leave some grades
/// with stale orders and others colliding, so every problem is caught before
/// the transaction below writes anything.
export function validateGradeOrder(ids: number[], existingIds: number[]): void {
  if (ids.length === 0) throw new Error("The grade list is empty.");

  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Grade ${id} is listed more than once.`);
    seen.add(id);
  }

  const existing = new Set(existingIds);
  for (const id of ids) {
    if (!existing.has(id)) throw new Error(`Grade ${id} does not exist.`);
  }

  const missing = existingIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(
      `The list is missing existing grade(s): ${missing.join(", ")}.`,
    );
  }
}

/// Rewrites every grade's `order` to match `ids`, 0…n-1 in that sequence —
/// the whole-board counterpart to `moveGrade`'s single swap. `order` is
/// @unique, so the new values cannot be written directly; each row is parked
/// below every existing order first, the same park-then-write shape
/// `normaliseGradeOrder` uses, then given its real value, all inside one
/// transaction.
export async function reorderGrades(ids: number[]) {
  const existing = await prisma.grade.findMany({ select: { id: true } });
  validateGradeOrder(ids, existing.map((g) => g.id));

  const lowest = await prisma.grade.aggregate({ _min: { order: true } });
  let parking = parkingFloor(lowest._min.order);

  return prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await tx.grade.update({ where: { id }, data: { order: parking-- } });
    }
    for (const [index, id] of ids.entries()) {
      await tx.grade.update({ where: { id }, data: { order: index } });
    }
    return ids.length;
  });
}
