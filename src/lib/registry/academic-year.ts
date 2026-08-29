import { prisma } from "@/lib/prisma";
import { BS_MAX_YEAR, BS_MIN_YEAR, bsYearRange } from "@/lib/date/bs";

export type AcademicYearInput = { nameBS: string };

export function listAcademicYears() {
  return prisma.academicYear.findMany({ orderBy: { nameBS: "desc" } });
}

/// Years with how much is set up in each, so the switcher can warn before
/// moving the whole app into a year that has nothing in it yet.
export async function listAcademicYearsWithSize() {
  const years = await prisma.academicYear.findMany({
    orderBy: { nameBS: "desc" },
    include: { _count: { select: { sections: true, enrollments: true } } },
  });
  return years.map((year) => ({
    id: year.id,
    nameBS: year.nameBS,
    startsOn: year.startsOn,
    endsOn: year.endsOn,
    isCurrent: year.isCurrent,
    sections: year._count.sections,
    enrollments: year._count.enrollments,
  }));
}

export function getCurrentAcademicYear() {
  return prisma.academicYear.findFirst({ where: { isCurrent: true } });
}

/// The BS year name is the only input; its AD span is derived, so the two can
/// never disagree.
export async function createAcademicYear({ nameBS }: AcademicYearInput) {
  const year = Number(nameBS);
  if (!Number.isInteger(year) || year < BS_MIN_YEAR || year > BS_MAX_YEAR) {
    throw new RangeError(`Academic year must be between ${BS_MIN_YEAR} and ${BS_MAX_YEAR}.`);
  }

  const { startsOn, endsOn } = bsYearRange(year);
  // Adopt the new year whenever nothing is current, not merely on the first ever
  // row — otherwise deleting the current year leaves the whole app with none.
  const hasCurrent = (await prisma.academicYear.count({ where: { isCurrent: true } })) > 0;

  return prisma.academicYear.create({
    data: { nameBS: String(year), startsOn, endsOn, isCurrent: !hasCurrent },
  });
}

export class UnknownYearError extends Error {}

/// Exactly one year is current. Both writes share a transaction so a failure
/// cannot leave the school with two current years, or none.
export async function setCurrentAcademicYear(id: number) {
  // Checked first so a stale id reads as a message, not a crashed layout.
  const year = await prisma.academicYear.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!year) throw new UnknownYearError("That academic year no longer exists.");

  return prisma.$transaction([
    prisma.academicYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.academicYear.update({ where: { id }, data: { isCurrent: true } }),
  ]);
}

export function getAcademicYear(id: number) {
  return prisma.academicYear.findUnique({ where: { id } });
}

/// Renaming re-derives the AD span, so the name and the dates never disagree.
export async function renameAcademicYear(id: number, nameBS: string) {
  const year = Number(nameBS);
  if (!Number.isInteger(year) || year < BS_MIN_YEAR || year > BS_MAX_YEAR) {
    throw new RangeError(`Academic year must be between ${BS_MIN_YEAR} and ${BS_MAX_YEAR}.`);
  }
  const { startsOn, endsOn } = bsYearRange(year);
  return prisma.academicYear.update({
    where: { id },
    data: { nameBS: String(year), startsOn, endsOn },
  });
}

/// A year holding any school data must not disappear under it.
export async function deleteAcademicYear(id: number) {
  const [sections, offerings, enrollments] = await Promise.all([
    prisma.section.count({ where: { academicYearId: id } }),
    prisma.subjectOffering.count({ where: { academicYearId: id } }),
    prisma.enrollment.count({ where: { academicYearId: id } }),
  ]);
  const blocking = sections + offerings + enrollments;
  if (blocking > 0) {
    throw new Error(
      `Year still has ${sections} section(s), ${offerings} offering(s) and ${enrollments} enrollment(s).`,
    );
  }
  return prisma.academicYear.delete({ where: { id } });
}
