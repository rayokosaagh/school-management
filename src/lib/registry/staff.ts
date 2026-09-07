import { prisma } from "@/lib/prisma";
import { composeFullName, type NameParts } from "./names";
import { toBsInput } from "@/lib/date/bs";

export type StaffInput = NameParts & {
  fullNameNp?: string | null;
  phone: string;
  designation: string;
  joinedOn: Date;
};

export function listStaff({ activeOnly = false } = {}) {
  return prisma.staff.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    include: {
      user: { select: { username: true } },
      _count: { select: { sectionsLed: true, assignments: true } },
    },
  });
}

/// Only active staff can be picked as a class teacher or given a subject.
export function listActiveStaffForSelect() {
  return prisma.staff.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, designation: true, photoId: true },
  });
}

export function createStaff(input: StaffInput) {
  return prisma.staff.create({
    data: {
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim() || null,
      lastName: input.lastName.trim(),
      fullName: composeFullName(input),
      fullNameNp: input.fullNameNp || null,
      phone: input.phone,
      designation: input.designation,
      joinedOn: input.joinedOn,
    },
  });
}

/// Staff leave rather than get deleted, so sections they led keep their history.
export function setStaffActive(id: number, isActive: boolean) {
  return prisma.staff.update({ where: { id }, data: { isActive } });
}

export function getStaff(id: number) {
  return prisma.staff.findUnique({ where: { id } });
}

export function updateStaff(id: number, input: StaffInput) {
  return prisma.staff.update({
    where: { id },
    data: {
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim() || null,
      lastName: input.lastName.trim(),
      fullName: composeFullName(input),
      fullNameNp: input.fullNameNp || null,
      phone: input.phone,
      designation: input.designation,
      joinedOn: input.joinedOn,
    },
  });
}

/// Deleting is only offered once nothing points at the person; otherwise the
/// honest action is marking them as left.
export async function deleteStaff(id: number) {
  const [sections, assignments, attendance] = await Promise.all([
    prisma.section.count({ where: { classTeacherId: id } }),
    prisma.teacherAssignment.count({ where: { staffId: id } }),
    prisma.attendanceSession.count({ where: { takenById: id } }),
  ]);
  if (sections + assignments + attendance > 0) {
    throw new Error(
      `Still class teacher of ${sections}, teaching ${assignments} subject(s). Mark as left instead.`,
    );
  }
  return prisma.staff.delete({ where: { id } });
}

/// Everything the staff profile shows: duties, teaching load and the login
/// account, if one has been linked.
export function getStaffDetail(id: number) {
  return prisma.staff.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, email: true } },
      sectionsLed: {
        orderBy: [{ academicYear: { nameBS: "desc" } }, { grade: { order: "asc" } }],
        include: { grade: true, academicYear: true },
      },
      assignments: {
        include: {
          section: { include: { grade: true, academicYear: true } },
          subjectOffering: { include: { subject: true } },
        },
      },
      _count: { select: { attendanceKept: true } },
    },
  });
}

export type StaffSummary = {
  staffId: number;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  phone: string;
  designation: string;
  joinedOnBs: string;
  isActive: boolean;
  account: { username: string; email: string | null } | null;
  sectionsLed: { id: number; label: string; year: string }[];
  load: { year: string; items: { section: string; subject: string }[] }[];
  rollCallsTaken: number;
};

/// The staff detail pane in one call; teaching load is grouped by year with
/// the given academic year first.
export async function getStaffSummary(staffId: number, academicYearId: number): Promise<StaffSummary | null> {
  const staff = await getStaffDetail(staffId);
  if (!staff) return null;

  const byYear = new Map<string, { section: string; subject: string }[]>();
  const years: { id: number; nameBS: string }[] = [];
  for (const a of staff.assignments) {
    const y = a.section.academicYear;
    if (!byYear.has(y.nameBS)) {
      byYear.set(y.nameBS, []);
      years.push({ id: y.id, nameBS: y.nameBS });
    }
    byYear.get(y.nameBS)!.push({
      section: `${a.section.grade.name} ${a.section.name}`,
      subject: a.subjectOffering.subject.name,
    });
  }
  years.sort((a, b) => (a.id === academicYearId ? -1 : b.id === academicYearId ? 1 : b.nameBS.localeCompare(a.nameBS)));

  return {
    staffId: staff.id,
    fullName: staff.fullName,
    fullNameNp: staff.fullNameNp,
    photoId: staff.photoId,
    phone: staff.phone,
    designation: staff.designation,
    joinedOnBs: toBsInput(staff.joinedOn),
    isActive: staff.isActive,
    account: staff.user ? { username: staff.user.username, email: staff.user.email ?? null } : null,
    sectionsLed: staff.sectionsLed.map((s) => ({
      id: s.id, label: `${s.grade.name} ${s.name}`, year: s.academicYear.nameBS,
    })),
    load: years.map((y) => ({ year: y.nameBS, items: byYear.get(y.nameBS) ?? [] })),
    rollCallsTaken: staff._count.attendanceKept,
  };
}
