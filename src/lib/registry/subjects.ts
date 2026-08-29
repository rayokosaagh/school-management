import { prisma } from "@/lib/prisma";

export type OfferingInput = {
  subjectId: number;
  gradeId: number;
  academicYearId: number;
  hasPractical: boolean;
  fullMarksTheory: number;
  passMarksTheory: number;
  fullMarksPractical?: number | null;
  passMarksPractical?: number | null;
};

export function listSubjects() {
  return prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { offerings: true } } },
  });
}

export function createSubject({ name, code }: { name: string; code: string }) {
  return prisma.subject.create({ data: { name, code } });
}

/// A subject still taught somewhere cannot be removed; retire the offering first.
export async function deleteSubject(id: number) {
  const count = await prisma.subjectOffering.count({ where: { subjectId: id } });
  if (count > 0) {
    throw new Error(`Taught in ${count} grade(s). Remove those offerings first.`);
  }
  return prisma.subject.delete({ where: { id } });
}

/// Offerings for one year, grouped in grade order so the page can render by grade.
export function listOfferings(academicYearId: number) {
  return prisma.subjectOffering.findMany({
    where: { academicYearId },
    orderBy: [{ grade: { order: "asc" } }, { subject: { name: "asc" } }],
    include: {
      subject: true,
      grade: true,
      _count: { select: { assignments: true } },
    },
  });
}

export function createOffering(input: OfferingInput) {
  return prisma.subjectOffering.create({
    data: {
      subjectId: input.subjectId,
      gradeId: input.gradeId,
      academicYearId: input.academicYearId,
      hasPractical: input.hasPractical,
      fullMarksTheory: input.fullMarksTheory,
      passMarksTheory: input.passMarksTheory,
      // Practical marks are meaningless without a practical, so they are cleared
      // rather than left behind when the flag is off.
      fullMarksPractical: input.hasPractical ? (input.fullMarksPractical ?? null) : null,
      passMarksPractical: input.hasPractical ? (input.passMarksPractical ?? null) : null,
    },
  });
}

/// Teacher assignments hang off an offering, so removing one would orphan them.
export async function deleteOffering(id: number) {
  const count = await prisma.teacherAssignment.count({
    where: { subjectOfferingId: id },
  });
  if (count > 0) {
    throw new Error(`${count} teacher assignment(s) use this. Remove them first.`);
  }
  return prisma.subjectOffering.delete({ where: { id } });
}

export function updateSubject(id: number, data: { name: string; code: string }) {
  return prisma.subject.update({ where: { id }, data });
}

export function updateOffering(
  id: number,
  input: Omit<OfferingInput, "subjectId" | "gradeId" | "academicYearId">,
) {
  return prisma.subjectOffering.update({
    where: { id },
    data: {
      hasPractical: input.hasPractical,
      fullMarksTheory: input.fullMarksTheory,
      passMarksTheory: input.passMarksTheory,
      fullMarksPractical: input.hasPractical ? (input.fullMarksPractical ?? null) : null,
      passMarksPractical: input.hasPractical ? (input.passMarksPractical ?? null) : null,
    },
  });
}
