import { prisma } from "@/lib/prisma";
import type { Gender, GuardianRelation, StudentStatus } from "@/generated/prisma/enums";
import { composeFullName, type NameParts } from "./names";
import { studentCalendar } from "@/lib/attendance/attendance";
import { attendancePercent, lastDays, stripFromCalendar } from "@/lib/attendance/strip";
import { getStudentMarksheets } from "@/lib/assessment/exams";
import { formatBs, toBsInput } from "@/lib/date/bs";
import type { DayStatus } from "@/components/ui/attendance-strip";

export type GuardianInput = {
  relation: GuardianRelation;
  fullName: string;
  phone: string;
  occupation?: string | null;
  isPrimary?: boolean;
};

export type StudentInput = NameParts & {
  admissionNo: string;
  fullNameNp?: string | null;
  dob: Date;
  gender: Gender;
  address?: string | null;
  admittedOn: Date;
  guardians: GuardianInput[];
  enrollment: { sectionId: number; academicYearId: number; rollNo?: number };
};

/// Students enrolled in one year, optionally narrowed to a section or a search.
export function listEnrolledStudents({
  academicYearId,
  sectionId,
  search,
}: {
  academicYearId: number;
  sectionId?: number;
  search?: string;
}) {
  return prisma.enrollment.findMany({
    where: {
      academicYearId,
      ...(sectionId ? { sectionId } : {}),
      ...(search
        ? {
            student: {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { admissionNo: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    orderBy: [
      { section: { grade: { order: "asc" } } },
      { section: { name: "asc" } },
      { rollNo: "asc" },
    ],
    include: {
      student: {
        // All guardians, primary first — the row shows one, the detail panel edits them all.
        include: { guardians: { orderBy: { isPrimary: "desc" } } },
      },
      section: { include: { grade: true } },
    },
  });
}

/// Roll numbers run 1..n within a section for a year, so the next one is the
/// current highest plus one rather than a count, which would repeat after a move.
export async function nextRollNo(sectionId: number, academicYearId: number) {
  const highest = await prisma.enrollment.findFirst({
    where: { sectionId, academicYearId },
    orderBy: { rollNo: "desc" },
    select: { rollNo: true },
  });
  return (highest?.rollNo ?? 0) + 1;
}

/// Student, guardians and enrollment are one unit — a student with no place in
/// a section is not something the rest of the app knows how to show.
export async function createStudent(input: StudentInput) {
  const rollNo =
    input.enrollment.rollNo ??
    (await nextRollNo(input.enrollment.sectionId, input.enrollment.academicYearId));

  return prisma.student.create({
    data: {
      admissionNo: input.admissionNo,
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim() || null,
      lastName: input.lastName.trim(),
      fullName: composeFullName(input),
      fullNameNp: input.fullNameNp || null,
      dob: input.dob,
      gender: input.gender,
      address: input.address || null,
      admittedOn: input.admittedOn,
      guardians: { create: input.guardians },
      enrollments: {
        create: {
          sectionId: input.enrollment.sectionId,
          academicYearId: input.enrollment.academicYearId,
          rollNo,
          enrolledOn: input.admittedOn,
        },
      },
    },
  });
}

export function getStudent(id: number) {
  return prisma.student.findUnique({
    where: { id },
    include: {
      guardians: true,
      enrollments: {
        orderBy: { academicYearId: "desc" },
        include: { section: { include: { grade: true } }, academicYear: true },
      },
    },
  });
}

/// Suggests the next admission number as a plain running integer, ignoring any
/// that were entered in another format.
export async function suggestAdmissionNo() {
  const students = await prisma.student.findMany({
    select: { admissionNo: true },
  });
  const highest = students.reduce((max, s) => {
    const n = Number(s.admissionNo);
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  return String(highest + 1);
}

export type StudentEdit = NameParts & {
  admissionNo: string;
  fullNameNp?: string | null;
  dob: Date;
  gender: Gender;
  address?: string | null;
  admittedOn: Date;
  status: StudentStatus;
};

export function updateStudent(id: number, input: StudentEdit) {
  return prisma.student.update({
    where: { id },
    data: {
      admissionNo: input.admissionNo,
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim() || null,
      lastName: input.lastName.trim(),
      fullName: composeFullName(input),
      fullNameNp: input.fullNameNp || null,
      dob: input.dob,
      gender: input.gender,
      address: input.address || null,
      admittedOn: input.admittedOn,
      status: input.status,
    },
  });
}

/// Deleting removes the guardians and enrolments with the student, so it is only
/// for records entered by mistake. A student who has left is marked LEFT instead.
export async function deleteStudent(id: number) {
  const attendance = await prisma.attendanceRecord.count({ where: { studentId: id } });
  if (attendance > 0) {
    throw new Error(
      `${attendance} attendance record(s) exist. Mark the student as left instead.`,
    );
  }
  // Note which sections lose a member, so their rolls can be closed up after.
  const enrolments = await prisma.enrollment.findMany({
    where: { studentId: id },
    select: { sectionId: true, academicYearId: true },
  });

  return prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({ where: { studentId: id } });
    await tx.guardian.deleteMany({ where: { studentId: id } });
    const student = await tx.student.delete({ where: { id } });
    for (const e of enrolments) {
      await resequenceRolls(e.sectionId, e.academicYearId, tx);
    }
    return student;
  });
}

/// Closes gaps in a section's roll so the numbers run 1..n again. Roll numbers
/// are unique within a section, so the rows are parked on negatives first — the
/// same reason grade ordering needs a parking pass.
export async function resequenceRolls(
  sectionId: number,
  academicYearId: number,
  client: Pick<typeof prisma, "enrollment"> = prisma,
) {
  const rows = await client.enrollment.findMany({
    where: { sectionId, academicYearId },
    orderBy: { rollNo: "asc" },
    select: { id: true, rollNo: true },
  });

  // Nothing to do when the roll is already 1..n; avoids writing every row on
  // every move.
  const alreadyTidy = rows.every((row, i) => row.rollNo === i + 1);
  if (alreadyTidy) return rows.length;

  let parking = -1;
  for (const row of rows) {
    await client.enrollment.update({ where: { id: row.id }, data: { rollNo: parking-- } });
  }
  for (const [index, row] of rows.entries()) {
    await client.enrollment.update({ where: { id: row.id }, data: { rollNo: index + 1 } });
  }
  return rows.length;
}

/// Moving sections keeps one enrolment per year: the student is given the next
/// free roll in the destination, and the section they left is closed up so it
/// does not keep a permanent hole where they used to be.
export async function moveStudent(
  studentId: number,
  academicYearId: number,
  sectionId: number,
) {
  const existing = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });
  if (!existing) throw new Error("That student is not enrolled this year.");
  if (existing.sectionId === sectionId) return existing;

  const from = existing.sectionId;

  return prisma.$transaction(async (tx) => {
    const highest = await tx.enrollment.aggregate({
      where: { sectionId, academicYearId },
      _max: { rollNo: true },
    });
    const moved = await tx.enrollment.update({
      where: { id: existing.id },
      data: { sectionId, rollNo: (highest._max.rollNo ?? 0) + 1 },
    });
    await resequenceRolls(from, academicYearId, tx);
    return moved;
  });
}

export function setRollNo(enrollmentId: number, rollNo: number) {
  return prisma.enrollment.update({ where: { id: enrollmentId }, data: { rollNo } });
}

export function addGuardian(studentId: number, guardian: GuardianInput) {
  return prisma.guardian.create({ data: { ...guardian, studentId } });
}

export function updateGuardian(id: number, guardian: GuardianInput) {
  return prisma.guardian.update({ where: { id }, data: guardian });
}

/// A student must keep at least one contact, or absence messages have nowhere to go.
export async function deleteGuardian(id: number) {
  const guardian = await prisma.guardian.findUnique({ where: { id } });
  if (!guardian) throw new Error("That guardian no longer exists.");
  const count = await prisma.guardian.count({ where: { studentId: guardian.studentId } });
  if (count <= 1) throw new Error("A student must have at least one guardian.");
  return prisma.guardian.delete({ where: { id } });
}

export type StudentSummary = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  gender: string;
  status: string;
  address: string | null;
  dobBs: string;
  dobAd: string;
  admittedOnBs: string;
  enrollment: { sectionId: number; sectionLabel: string; rollNo: number } | null;
  guardians: { id: number; relation: string; fullName: string; phone: string; occupation: string | null; isPrimary: boolean }[];
  attendance: { percent: number | null; recorded: number; days: DayStatus[] };
  exams: { termId: number; name: string; isPublished: boolean; percent: number | null; gpa: number | null }[];
  history: { year: string; sectionLabel: string; rollNo: number; enrolledOnBs: string }[];
};

/// Everything the detail pane shows for one student, in one call. Attendance
/// is over the given academic year; exams come from the current-year ledgers.
export async function getStudentSummary(
  studentId: number,
  academicYearId: number,
  today: Date,
): Promise<StudentSummary | null> {
  const student = await getStudent(studentId);
  if (!student) return null;

  const current = student.enrollments.find((e) => e.academicYearId === academicYearId) ?? null;
  const year = current?.academicYear ?? null;

  const [records, sheets] = await Promise.all([
    year ? studentCalendar(studentId, year.startsOn, year.endsOn) : Promise.resolve([]),
    getStudentMarksheets(studentId),
  ]);

  const days = lastDays(today, 14);
  const label = (e: { section: { name: string; grade: { name: string } } }) => `${e.section.grade.name} ${e.section.name}`;

  return {
    studentId: student.id,
    admissionNo: student.admissionNo,
    fullName: student.fullName,
    fullNameNp: student.fullNameNp,
    photoId: student.photoId,
    gender: student.gender,
    status: student.status,
    address: student.address,
    dobBs: toBsInput(student.dob),
    dobAd: student.dob.toISOString().slice(0, 10),
    admittedOnBs: toBsInput(student.admittedOn),
    enrollment: current ? { sectionId: current.sectionId, sectionLabel: label(current), rollNo: current.rollNo } : null,
    guardians: student.guardians.map((g) => ({
      id: g.id, relation: g.relation, fullName: g.fullName, phone: g.phone, occupation: g.occupation, isPrimary: g.isPrimary,
    })),
    attendance: {
      percent: attendancePercent(records),
      recorded: records.length,
      days: stripFromCalendar(records, days),
    },
    exams: (sheets?.sheets ?? []).map((s) => ({
      termId: s.term.id,
      name: s.term.name,
      isPublished: s.term.isPublished,
      percent: s.result.overall.percent == null ? null : Math.round(s.result.overall.percent),
      gpa: s.result.overall.gpa == null ? null : Math.round(s.result.overall.gpa * 100) / 100,
    })),
    history: student.enrollments.map((e) => ({
      year: e.academicYear.nameBS,
      sectionLabel: label(e),
      rollNo: e.rollNo,
      enrolledOnBs: formatBs(e.enrolledOn, "YYYY-MM-DD"),
    })),
  };
}
