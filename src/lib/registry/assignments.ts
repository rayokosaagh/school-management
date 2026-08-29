import { prisma } from "@/lib/prisma";

/// Sections for a year with how many of their subjects already have a teacher.
export function listSectionsWithAssignmentCounts(academicYearId: number) {
  return prisma.section.findMany({
    where: { academicYearId },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
    include: {
      grade: true,
      classTeacher: { select: { id: true, fullName: true } },
      _count: { select: { assignments: true } },
    },
  });
}

/// One row per subject the section's grade is taught this year, each carrying
/// the teacher currently responsible for it, if any.
export async function getSectionTeachingPlan(sectionId: number) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { grade: true, classTeacher: { select: { id: true, fullName: true } } },
  });
  if (!section) return null;

  const [offerings, assignments] = await Promise.all([
    prisma.subjectOffering.findMany({
      where: { gradeId: section.gradeId, academicYearId: section.academicYearId },
      orderBy: { subject: { name: "asc" } },
      include: { subject: true },
    }),
    prisma.teacherAssignment.findMany({
      where: { sectionId },
      include: { staff: { select: { id: true, fullName: true, isActive: true } } },
    }),
  ]);

  return {
    section,
    rows: offerings.map((offering) => ({
      offering,
      assigned:
        assignments.find((a) => a.subjectOfferingId === offering.id)?.staff ?? null,
    })),
  };
}

export class AssignmentMismatchError extends Error {}

/// One teacher per subject per section. Passing null clears it.
/// The offering is re-checked against the section's own grade and year, because
/// nothing in the schema stops a Class 9 offering being attached to a Class 5 section.
export async function setSubjectTeacher(
  sectionId: number,
  subjectOfferingId: number,
  staffId: number | null,
) {
  const [section, offering] = await Promise.all([
    prisma.section.findUnique({ where: { id: sectionId } }),
    prisma.subjectOffering.findUnique({ where: { id: subjectOfferingId } }),
  ]);

  if (!section) throw new AssignmentMismatchError("That section no longer exists.");
  if (!offering) throw new AssignmentMismatchError("That subject is no longer offered.");
  if (
    offering.gradeId !== section.gradeId ||
    offering.academicYearId !== section.academicYearId
  ) {
    throw new AssignmentMismatchError(
      "That subject is not taught to this section's grade this year.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.teacherAssignment.deleteMany({ where: { sectionId, subjectOfferingId } });
    if (staffId === null) return null;
    return tx.teacherAssignment.create({
      data: { staffId, sectionId, subjectOfferingId },
    });
  });
}

/// A teacher's whole load for one year — what the marks-entry screen will scope to.
export function listTeachingLoad(academicYearId: number) {
  return prisma.teacherAssignment.findMany({
    where: { section: { academicYearId } },
    orderBy: [
      { staff: { fullName: "asc" } },
      { section: { grade: { order: "asc" } } },
      { section: { name: "asc" } },
    ],
    include: {
      staff: { select: { id: true, fullName: true, isActive: true } },
      section: { include: { grade: true } },
      subjectOffering: { include: { subject: true } },
    },
  });
}
