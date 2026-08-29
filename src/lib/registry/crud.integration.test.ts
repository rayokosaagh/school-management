import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import {
  createAcademicYear,
  deleteAcademicYear,
  renameAcademicYear,
} from "./academic-year";
import {
  createGrade,
  createSection,
  deleteGrade,
  moveGrade,
  renameSection,
} from "./structure";
import { createStaff, deleteStaff, updateStaff } from "./staff";
import { createOffering, createSubject, updateOffering } from "./subjects";
import { setSubjectTeacher } from "./assignments";
import {
  addGuardian,
  createStudent,
  deleteGuardian,
  deleteStudent,
  moveStudent,
  resequenceRolls,
  updateStudent,
} from "./students";

// Covers the edit and delete paths added for the CRUD pass, especially the
// referential guards, which is where "deletable" quietly goes wrong.
const made = {
  yearId: 0,
  gradeId: 0,
  sectionA: 0,
  sectionB: 0,
  staffId: 0,
  subjectId: 0,
  offeringId: 0,
  studentId: 0,
  guardianIds: [] as number[],
};

const BS_YEAR = 2093;
const GRADE = "__crud Class 4";

beforeAll(async () => {
  const year = await createAcademicYear({ nameBS: String(BS_YEAR) });
  made.yearId = year.id;

  const grade = await createGrade({ name: GRADE, order: 9931 });
  made.gradeId = grade.id;

  made.sectionA = (
    await createSection({ name: "A", gradeId: grade.id, academicYearId: year.id })
  ).id;
  made.sectionB = (
    await createSection({ name: "B", gradeId: grade.id, academicYearId: year.id })
  ).id;

  made.staffId = (
    await createStaff({
      firstName: "__crud",
      middleName: "Mina",
      lastName: "Rai",
      phone: "9855555555",
      designation: "Teacher",
      joinedOn: new Date(Date.UTC(2020, 3, 14)),
    })
  ).id;

  made.subjectId = (
    await createSubject({ name: "__crud Nepali", code: `CRD${Date.now() % 100000}` })
  ).id;

  made.offeringId = (
    await createOffering({
      subjectId: made.subjectId,
      gradeId: grade.id,
      academicYearId: year.id,
      hasPractical: true,
      fullMarksTheory: 75,
      passMarksTheory: 27,
      fullMarksPractical: 25,
      passMarksPractical: 10,
    })
  ).id;

  const student = await createStudent({
    admissionNo: `__crud-${Date.now()}`,
    firstName: "__crud",
    middleName: "Sunita",
    lastName: "Magar",
    dob: new Date(Date.UTC(2014, 2, 3)),
    gender: "FEMALE",
    admittedOn: bsToAd({ year: BS_YEAR, month: 1, day: 5 }),
    guardians: [
      { relation: "FATHER", fullName: "__crud Bir", phone: "9866666666", isPrimary: true },
    ],
    enrollment: { sectionId: made.sectionA, academicYearId: year.id },
  });
  made.studentId = student.id;
  made.guardianIds = (
    await prisma.guardian.findMany({ where: { studentId: student.id }, select: { id: true } })
  ).map((g) => g.id);
});

afterAll(async () => {
  await prisma.teacherAssignment.deleteMany({
    where: { sectionId: { in: [made.sectionA, made.sectionB] } },
  });
  await prisma.enrollment.deleteMany({ where: { studentId: made.studentId } });
  await prisma.guardian.deleteMany({ where: { studentId: made.studentId } });
  await prisma.student.deleteMany({ where: { id: made.studentId } });
  await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  await prisma.section.deleteMany({ where: { id: { in: [made.sectionA, made.sectionB] } } });
  await prisma.staff.deleteMany({ where: { id: made.staffId } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("crud edit and delete", () => {
  it("renames an academic year and re-derives its span", async () => {
    const before = await prisma.academicYear.findUnique({ where: { id: made.yearId } });
    const after = await renameAcademicYear(made.yearId, String(BS_YEAR + 1));

    expect(after.nameBS).toBe(String(BS_YEAR + 1));
    expect(after.startsOn.getTime()).not.toBe(before!.startsOn.getTime());

    await renameAcademicYear(made.yearId, String(BS_YEAR));
  });

  it("refuses to delete a year that still holds sections", async () => {
    await expect(deleteAcademicYear(made.yearId)).rejects.toThrow(/section/i);
  });

  it("refuses to delete a grade that still has sections and offerings", async () => {
    await expect(deleteGrade(made.gradeId)).rejects.toThrow(/section/i);
  });

  it("renames a section", async () => {
    const renamed = await renameSection(made.sectionB, "C");
    expect(renamed.name).toBe("C");
    await renameSection(made.sectionB, "B");
  });

  it("edits staff and refuses deletion once they teach something", async () => {
    const updated = await updateStaff(made.staffId, {
      firstName: "__crud",
      middleName: "Mina Rai",
      lastName: "Shrestha",
      phone: "9855555556",
      designation: "Senior Teacher",
      joinedOn: new Date(Date.UTC(2020, 3, 14)),
    });
    expect(updated.designation).toBe("Senior Teacher");

    await setSubjectTeacher(made.sectionA, made.offeringId, made.staffId);
    await expect(deleteStaff(made.staffId)).rejects.toThrow(/mark as left/i);

    await setSubjectTeacher(made.sectionA, made.offeringId, null);
  });

  it("clears practical marks when the practical is switched off", async () => {
    const off = await updateOffering(made.offeringId, {
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
      fullMarksPractical: 25,
      passMarksPractical: 10,
    });
    expect(off.fullMarksPractical).toBeNull();
    expect(off.passMarksPractical).toBeNull();

    const on = await updateOffering(made.offeringId, {
      hasPractical: true,
      fullMarksTheory: 75,
      passMarksTheory: 27,
      fullMarksPractical: 25,
      passMarksPractical: 10,
    });
    expect(on.fullMarksPractical).toBe(25);
  });

  it("edits a student", async () => {
    const updated = await updateStudent(made.studentId, {
      admissionNo: `__crud-edited-${Date.now()}`,
      firstName: "__crud",
      middleName: "Sunita",
      lastName: "Magar",
      dob: new Date(Date.UTC(2014, 2, 3)),
      gender: "FEMALE",
      address: "Pokhara-8",
      admittedOn: bsToAd({ year: BS_YEAR, month: 1, day: 5 }),
      status: "ACTIVE",
    });
    expect(updated.address).toBe("Pokhara-8");
  });

  it("reissues the roll number when a student moves section", async () => {
    const moved = await moveStudent(made.studentId, made.yearId, made.sectionB);
    expect(moved.sectionId).toBe(made.sectionB);
    expect(moved.rollNo).toBe(1);

    const enrolments = await prisma.enrollment.count({
      where: { studentId: made.studentId, academicYearId: made.yearId },
    });
    expect(enrolments).toBe(1);
  });

  it("keeps at least one guardian", async () => {
    await expect(deleteGuardian(made.guardianIds[0])).rejects.toThrow(/at least one/i);

    const second = await addGuardian(made.studentId, {
      relation: "MOTHER",
      fullName: "__crud Kamala",
      phone: "9877777777",
    });
    await expect(deleteGuardian(second.id)).resolves.toBeTruthy();
  });

  it("deletes a student along with guardians and enrolments", async () => {
    await deleteStudent(made.studentId);

    const [student, guardians, enrolments] = await Promise.all([
      prisma.student.findUnique({ where: { id: made.studentId } }),
      prisma.guardian.count({ where: { studentId: made.studentId } }),
      prisma.enrollment.count({ where: { studentId: made.studentId } }),
    ]);
    expect(student).toBeNull();
    expect(guardians).toBe(0);
    expect(enrolments).toBe(0);
  });
});

// `order` is unique, so swapping a pair is the one operation that can fail on a
// constraint rather than on logic. Kept apart from the main block because it
// moves rows the other tests rely on being ordered.
describe.skipIf(!process.env.DB_TESTS)("grade ordering", () => {
  const ids: number[] = [];

  beforeAll(async () => {
    for (const [name, order] of [
      ["__ord Alpha", 9941],
      ["__ord Beta", 9942],
      ["__ord Gamma", 9943],
    ] as const) {
      ids.push((await createGrade({ name, order })).id);
    }
  });

  afterAll(async () => {
    await prisma.grade.deleteMany({ where: { id: { in: ids } } });
  });

  it("swaps a grade with the one above it", async () => {
    const before = await prisma.grade.findMany({
      where: { id: { in: ids } },
      orderBy: { order: "asc" },
    });
    expect(before.map((g) => g.name)).toEqual([
      "__ord Alpha",
      "__ord Beta",
      "__ord Gamma",
    ]);

    await moveGrade(ids[1], "up");

    const after = await prisma.grade.findMany({
      where: { id: { in: ids } },
      orderBy: { order: "asc" },
    });
    expect(after.map((g) => g.name)).toEqual([
      "__ord Beta",
      "__ord Alpha",
      "__ord Gamma",
    ]);
  });

  it("swaps back down again", async () => {
    await moveGrade(ids[1], "down");
    const after = await prisma.grade.findMany({
      where: { id: { in: ids } },
      orderBy: { order: "asc" },
    });
    expect(after.map((g) => g.name)).toEqual([
      "__ord Alpha",
      "__ord Beta",
      "__ord Gamma",
    ]);
  });

  it("leaves orders unique after a swap", async () => {
    await moveGrade(ids[2], "up");
    const rows = await prisma.grade.findMany({ select: { order: true } });
    expect(new Set(rows.map((r) => r.order)).size).toBe(rows.length);
    await moveGrade(ids[2], "down");
  });

  it("reports when there is nowhere further to go", async () => {
    const lowest = await prisma.grade.findFirst({ orderBy: { order: "asc" } });
    expect(await moveGrade(lowest!.id, "up")).toBeNull();
  });
});

// Moving or deleting a student used to leave a permanent hole in the section
// they left: roll 1 gone, the rest still 2,3,4. These pin the closing-up.
describe.skipIf(!process.env.DB_TESTS)("roll numbers close their gaps", () => {
  const made = { yearId: 0, gradeId: 0, from: 0, to: 0, studentIds: [] as number[] };
  const BS = 2094;

  const rolls = (sectionId: number) =>
    prisma.enrollment
      .findMany({
        where: { sectionId, academicYearId: made.yearId },
        orderBy: { rollNo: "asc" },
        select: { rollNo: true },
      })
      .then((rows) => rows.map((r) => r.rollNo));

  beforeAll(async () => {
    made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
    made.gradeId = (await createGrade({ name: "__roll Class 2", order: 9951 })).id;
    made.from = (
      await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })
    ).id;
    made.to = (
      await createSection({ name: "B", gradeId: made.gradeId, academicYearId: made.yearId })
    ).id;

    for (const last of ["One", "Two", "Three", "Four"]) {
      const student = await createStudent({
        admissionNo: `__roll-${Date.now()}-${last}`,
        firstName: "__roll",
        lastName: last,
        dob: new Date(Date.UTC(2015, 0, 1)),
        gender: "MALE",
        admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
        guardians: [{ relation: "FATHER", fullName: "__roll Dad", phone: "9800000009" }],
        enrollment: { sectionId: made.from, academicYearId: made.yearId },
      });
      made.studentIds.push(student.id);
    }
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
    await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
    await prisma.section.deleteMany({ where: { id: { in: [made.from, made.to] } } });
    await prisma.grade.deleteMany({ where: { id: made.gradeId } });
    await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  });

  it("starts with a contiguous roll", async () => {
    expect(await rolls(made.from)).toEqual([1, 2, 3, 4]);
  });

  it("closes the gap when the first student moves away", async () => {
    await moveStudent(made.studentIds[0], made.yearId, made.to);

    expect(await rolls(made.from)).toEqual([1, 2, 3]);
    expect(await rolls(made.to)).toEqual([1]);
  });

  it("keeps the remaining students in their original order", async () => {
    const rows = await prisma.enrollment.findMany({
      where: { sectionId: made.from, academicYearId: made.yearId },
      orderBy: { rollNo: "asc" },
      include: { student: { select: { lastName: true } } },
    });
    expect(rows.map((r) => r.student.lastName)).toEqual(["Two", "Three", "Four"]);
  });

  it("closes the gap when a student in the middle moves away", async () => {
    // "Three" is roll 2 of three; moving it must leave 1,2 not 1,3.
    await moveStudent(made.studentIds[2], made.yearId, made.to);
    expect(await rolls(made.from)).toEqual([1, 2]);
    expect(await rolls(made.to)).toEqual([1, 2]);
  });

  it("closes the gap when a student is deleted", async () => {
    await deleteStudent(made.studentIds[1]);
    expect(await rolls(made.from)).toEqual([1]);
  });

  it("renumbers a section on demand and is a no-op when already tidy", async () => {
    expect(await resequenceRolls(made.to, made.yearId)).toBe(2);
    expect(await rolls(made.to)).toEqual([1, 2]);
  });
});
