import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent } from "@/lib/registry/students";
import {
  AttendanceError,
  absenteesOn,
  getSheet,
  monthlyRegister,
  saveSheet,
  sectionsMissingAttendance,
} from "./attendance";

// Talks to the real database; tears down only what it made.
const made = {
  studentIds: [] as number[],
  strayStudentId: 0,
  sectionId: 0,
  otherSectionId: 0,
  gradeId: 0,
  yearId: 0,
};

const BS_YEAR = 2092;
const GRADE = "__att Class 7";
const day1 = bsToAd({ year: BS_YEAR, month: 1, day: 1 });
const day2 = bsToAd({ year: BS_YEAR, month: 1, day: 2 });

beforeAll(async () => {
  const year = await createAcademicYear({ nameBS: String(BS_YEAR) });
  made.yearId = year.id;

  const grade = await createGrade({ name: GRADE, order: 9921 });
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
        fullName: "__att Ram",
        phone: "9844444444",
        isPrimary: true,
      },
    ],
  };

  for (const last of ["Asha", "Bikash"]) {
    const student = await createStudent({
      ...base,
      admissionNo: `__att-${Date.now()}-${last}`,
      firstName: "__att",
      lastName: last,
      enrollment: { sectionId: section.id, academicYearId: year.id },
    });
    made.studentIds.push(student.id);
  }

  // Enrolled in section B, so it must be rejected on section A's sheet.
  const stray = await createStudent({
    ...base,
    admissionNo: `__att-${Date.now()}-stray`,
    firstName: "__att",
    lastName: "Stray",
    enrollment: { sectionId: other.id, academicYearId: year.id },
  });
  made.strayStudentId = stray.id;
  made.studentIds.push(stray.id);
});

afterAll(async () => {
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

describe.skipIf(!process.env.DB_TESTS)("attendance", () => {
  it("returns an untaken sheet defaulting everyone to present", async () => {
    const sheet = await getSheet(made.sectionId, day1);
    expect(sheet.taken).toBe(false);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows.every((r) => r.status === "PRESENT")).toBe(true);
    expect(sheet.rows.map((r) => r.rollNo)).toEqual([1, 2]);
  });

  it("saves a sheet and reads it back", async () => {
    await saveSheet({
      sectionId: made.sectionId,
      date: day1,
      entries: [
        { studentId: made.studentIds[0], status: "PRESENT" },
        { studentId: made.studentIds[1], status: "ABSENT" },
      ],
    });

    const sheet = await getSheet(made.sectionId, day1);
    expect(sheet.taken).toBe(true);
    expect(sheet.rows.find((r) => r.studentId === made.studentIds[1])?.status).toBe(
      "ABSENT",
    );
  });

  it("replaces the day rather than merging into it", async () => {
    await saveSheet({
      sectionId: made.sectionId,
      date: day1,
      entries: [
        { studentId: made.studentIds[0], status: "LATE" },
        { studentId: made.studentIds[1], status: "PRESENT" },
      ],
    });

    const records = await prisma.attendanceRecord.count({
      where: { session: { sectionId: made.sectionId, date: day1 } },
    });
    expect(records).toBe(2);

    const sheet = await getSheet(made.sectionId, day1);
    expect(sheet.rows.find((r) => r.studentId === made.studentIds[0])?.status).toBe(
      "LATE",
    );
  });

  it("keeps one session per section per day", async () => {
    const sessions = await prisma.attendanceSession.count({
      where: { sectionId: made.sectionId, date: day1 },
    });
    expect(sessions).toBe(1);
  });

  it("refuses a student who is not enrolled in that section", async () => {
    await expect(
      saveSheet({
        sectionId: made.sectionId,
        date: day2,
        entries: [{ studentId: made.strayStudentId, status: "PRESENT" }],
      }),
    ).rejects.toThrow(AttendanceError);
  });

  it("refuses a date outside the academic year", async () => {
    const outside = bsToAd({ year: BS_YEAR - 1, month: 6, day: 1 });
    await expect(getSheet(made.sectionId, outside)).rejects.toThrow(AttendanceError);
  });

  it("lists sections with no roll call for a day", async () => {
    const missing = await sectionsMissingAttendance(made.yearId, day1);
    const ids = missing.map((s) => s.id);
    expect(ids).toContain(made.otherSectionId);
    expect(ids).not.toContain(made.sectionId);
  });

  it("totals a Bikram Sambat month, counting late as attending", async () => {
    await saveSheet({
      sectionId: made.sectionId,
      date: day2,
      entries: [
        { studentId: made.studentIds[0], status: "PRESENT" },
        { studentId: made.studentIds[1], status: "ABSENT" },
      ],
    });

    const register = await monthlyRegister(made.sectionId, BS_YEAR, 1);
    expect(register.daysTaken).toBe(2);

    const first = register.rows.find((r) => r.studentId === made.studentIds[0]);
    expect(first?.attended).toBe(2);
    expect(first?.percent).toBe(100);

    // Day 1 was rewritten to PRESENT by the replace test above, so this student
    // is present once and absent once.
    const second = register.rows.find((r) => r.studentId === made.studentIds[1]);
    expect(second?.present).toBe(1);
    expect(second?.absent).toBe(1);
    expect(second?.attended).toBe(1);
    expect(second?.percent).toBe(50);
  });

  it("reports absentees with a guardian phone for messaging", async () => {
    const absentees = await absenteesOn(made.yearId, day2);
    expect(absentees).toHaveLength(1);
    expect(absentees[0].studentId).toBe(made.studentIds[1]);
    expect(absentees[0].guardian?.phone).toBe("9844444444");
    expect(absentees[0].section).toContain(GRADE);
  });
});
