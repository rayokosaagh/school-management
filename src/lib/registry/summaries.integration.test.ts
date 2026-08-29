import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection, setClassTeacher } from "@/lib/registry/structure";
import { createStudent, getStudentSummary } from "@/lib/registry/students";
import { recentStudentStrips, saveSheet } from "@/lib/attendance/attendance";
import { createStaff, getStaffSummary } from "@/lib/registry/staff";

// Talks to the real database; tears down only what it made.
const made = {
  studentIds: [] as number[],
  strayStudentId: 0,
  sectionId: 0,
  otherSectionId: 0,
  gradeId: 0,
  yearId: 0,
  sheetDate: new Date(),
  staffId: 0,
};

const BS_YEAR = 2093;
const GRADE = "__sum Class 7";
const day1 = bsToAd({ year: BS_YEAR, month: 1, day: 1 });

beforeAll(async () => {
  const year = await createAcademicYear({ nameBS: String(BS_YEAR) });
  made.yearId = year.id;

  const grade = await createGrade({ name: GRADE, order: 9922 });
  made.gradeId = grade.id;

  const section = await createSection({
    name: "A",
    gradeId: grade.id,
    academicYearId: year.id,
  });
  made.sectionId = section.id;

  const other = await createSection({
    name: "B",
    gradeId: grade.id,
    academicYearId: year.id,
  });
  made.otherSectionId = other.id;

  const base = {
    dob: new Date(Date.UTC(2013, 1, 1)),
    admittedOn: day1,
    gender: "MALE" as const,
    guardians: [
      {
        relation: "FATHER" as const,
        fullName: "__sum Ram",
        phone: "9844444444",
        isPrimary: true,
      },
    ],
  };

  for (const last of ["Asha", "Bikash"]) {
    const student = await createStudent({
      ...base,
      admissionNo: `__sum-${Date.now()}-${last}`,
      firstName: "__sum",
      lastName: last,
      enrollment: { sectionId: section.id, academicYearId: year.id },
    });
    made.studentIds.push(student.id);
  }

  // Enrolled in section B, so it must be rejected on section A's sheet.
  const stray = await createStudent({
    ...base,
    admissionNo: `__sum-${Date.now()}-stray`,
    firstName: "__sum",
    lastName: "Stray",
    enrollment: { sectionId: other.id, academicYearId: year.id },
  });
  made.strayStudentId = stray.id;
  made.studentIds.push(stray.id);

  made.sheetDate = day1;
  await saveSheet({
    sectionId: made.sectionId,
    date: day1,
    entries: [{ studentId: made.studentIds[0], status: "PRESENT" }],
  });
});

afterAll(async () => {
  if (made.staffId) {
    await prisma.section.updateMany({ where: { classTeacherId: made.staffId }, data: { classTeacherId: null } });
    await prisma.staff.delete({ where: { id: made.staffId } });
  }
  await prisma.attendanceRecord.deleteMany({
    where: { studentId: { in: made.studentIds } },
  });
  await prisma.attendanceSession.deleteMany({
    where: { sectionId: { in: [made.sectionId, made.otherSectionId] } },
  });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  await prisma.section.deleteMany({
    where: { id: { in: [made.sectionId, made.otherSectionId] } },
  });
  if (made.gradeId) await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  if (made.yearId) await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("summaries", () => {
  it("recentStudentStrips returns a strip per student with a record in the window", async () => {
    const strips = await recentStudentStrips(made.yearId, made.sheetDate, 14);
    const strip = strips.get(made.studentIds[0]);
    expect(strip).toHaveLength(14);
    expect(strip![13]).toBe("present"); // the sheet saved in beforeAll marks this student present on sheetDate
    expect(strip!.slice(0, 13).every((d) => d === "none")).toBe(true);
  });

  it("getStudentSummary composes record, enrolment, attendance and history", async () => {
    const s = await getStudentSummary(made.studentIds[0], made.yearId, made.sheetDate);
    expect(s).not.toBeNull();
    expect(s!.enrollment?.sectionId).toBe(made.sectionId);
    expect(s!.attendance.recorded).toBe(1);
    expect(s!.attendance.percent).toBe(100);
    expect(s!.attendance.days).toHaveLength(14);
    expect(s!.history).toHaveLength(1);
    expect(s!.exams).toEqual([]);
  });

  it("getStudentSummary is null for an unknown student", async () => {
    expect(await getStudentSummary(-1, made.yearId, made.sheetDate)).toBeNull();
  });

  it("getStaffSummary reports sections led and an empty load for a fresh staff member", async () => {
    const staff = await createStaff({ firstName: "Sum", lastName: "Teacher", phone: "9800000099", designation: "Teacher", joinedOn: new Date() });
    made.staffId = staff.id;
    await setClassTeacher(made.sectionId, staff.id);
    const s = await getStaffSummary(staff.id, made.yearId);
    expect(s?.sectionsLed.map((x) => x.id)).toEqual([made.sectionId]);
    expect(s?.load).toEqual([]);
    expect(s?.rollCallsTaken).toBe(0);
    expect(s?.account).toBeNull();
  });
});
