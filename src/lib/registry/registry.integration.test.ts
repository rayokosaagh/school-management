import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createAcademicYear, setCurrentAcademicYear } from "./academic-year";
import { createGrade, createSection, deleteSection, setClassTeacher } from "./structure";
import { createStaff } from "./staff";
import { createStudent, listEnrolledStudents, nextRollNo, suggestAdmissionNo } from "./students";
import {
  createOffering,
  createSubject,
  deleteOffering,
  deleteSubject,
  listOfferings,
} from "./subjects";
import {
  AssignmentMismatchError,
  getSectionTeachingPlan,
  listTeachingLoad,
  setSubjectTeacher,
} from "./assignments";

// Talks to the real database. Everything it makes is torn down afterwards, and
// it touches nothing it did not create.
const made = {
  studentIds: [] as number[],
  offeringIds: [] as number[],
  subjectIds: [] as number[],
  sectionId: 0,
  gradeId: 0,
  otherGradeId: 0,
  otherOfferingId: 0,
  staffId: 0,
  yearId: 0,
  /// The year the school had marked current before this suite hijacked it.
  previousCurrentYearId: null as number | null,
};

const YEAR = "2091";
const GRADE = "__smoke Class 9";

afterAll(async () => {
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  if (made.sectionId) {
    await prisma.teacherAssignment.deleteMany({ where: { sectionId: made.sectionId } });
  }
  if (made.otherOfferingId) {
    await prisma.subjectOffering.deleteMany({ where: { id: made.otherOfferingId } });
  }
  await prisma.subjectOffering.deleteMany({ where: { id: { in: made.offeringIds } } });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjectIds } } });
  if (made.sectionId) await prisma.section.deleteMany({ where: { id: made.sectionId } });
  if (made.otherGradeId) await prisma.grade.deleteMany({ where: { id: made.otherGradeId } });
  if (made.gradeId) await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  if (made.staffId) await prisma.staff.deleteMany({ where: { id: made.staffId } });
  if (made.yearId) await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  // Deleting the test year would otherwise leave the school with no current
  // year at all, which blanks every page.
  if (made.previousCurrentYearId !== null) {
    // Guarded: the year that was current may itself have been a fixture.
    const still = await prisma.academicYear.findUnique({
      where: { id: made.previousCurrentYearId },
      select: { id: true },
    });
    if (still) await setCurrentAcademicYear(made.previousCurrentYearId);
  }
  await prisma.$disconnect();
});

// Needs a live database, so it is opt-in: DB_TESTS=1 npx vitest run
describe.skipIf(!process.env.DB_TESTS)("registry vertical slice", () => {
  it("derives an academic year's AD span from its BS name", async () => {
    const year = await createAcademicYear({ nameBS: YEAR });
    made.yearId = year.id;

    expect(year.nameBS).toBe(YEAR);
    expect(year.endsOn.getTime()).toBeGreaterThan(year.startsOn.getTime());
  });

  it("keeps exactly one year current", async () => {
    // Marking the test year current unmarks the school's real one, so remember
    // which it was and put it back in teardown.
    const before = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    made.previousCurrentYearId = before?.id ?? null;
    await setCurrentAcademicYear(made.yearId);
    const current = await prisma.academicYear.count({ where: { isCurrent: true } });
    expect(current).toBe(1);
  });

  it("creates a grade, a section and a class teacher", async () => {
    const grade = await createGrade({ name: GRADE, order: 9911 });
    made.gradeId = grade.id;

    const section = await createSection({
      name: "A",
      gradeId: grade.id,
      academicYearId: made.yearId,
    });
    made.sectionId = section.id;

    const staff = await createStaff({
      firstName: "__smoke",
      middleName: "Sita",
      lastName: "Sharma",
      phone: "9800000000",
      designation: "Teacher",
      joinedOn: new Date(Date.UTC(2020, 3, 14)),
    });
    made.staffId = staff.id;

    const updated = await setClassTeacher(section.id, staff.id);
    expect(updated.classTeacherId).toBe(staff.id);
  });

  it("admits students with guardians and sequential roll numbers", async () => {
    expect(await nextRollNo(made.sectionId, made.yearId)).toBe(1);

    const base = {
      dob: new Date(Date.UTC(2012, 5, 1)),
      admittedOn: new Date(Date.UTC(2024, 3, 20)),
      gender: "MALE" as const,
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    };

    const first = await createStudent({
      ...base,
      admissionNo: `__smoke-${Date.now()}-1`,
      firstName: "__smoke",
      middleName: "Anish",
      lastName: "Thapa",
      guardians: [
        { relation: "FATHER", fullName: "Ram Thapa", phone: "9811111111", isPrimary: true },
      ],
    });
    made.studentIds.push(first.id);

    const second = await createStudent({
      ...base,
      admissionNo: `__smoke-${Date.now()}-2`,
      firstName: "__smoke",
      middleName: "Bina",
      lastName: "Rai",
      gender: "FEMALE",
      guardians: [
        { relation: "MOTHER", fullName: "Gita Rai", phone: "9822222222", isPrimary: true },
      ],
    });
    made.studentIds.push(second.id);

    const rolls = await prisma.enrollment.findMany({
      where: { sectionId: made.sectionId },
      orderBy: { rollNo: "asc" },
      select: { rollNo: true },
    });
    expect(rolls.map((r) => r.rollNo)).toEqual([1, 2]);
  });

  it("lists the roll with section and primary guardian joined", async () => {
    const rows = await listEnrolledStudents({ academicYearId: made.yearId });
    expect(rows).toHaveLength(2);
    expect(rows[0].section.grade.name).toBe(GRADE);
    expect(rows[0].student.guardians[0].isPrimary).toBe(true);
  });

  it("narrows by search", async () => {
    const rows = await listEnrolledStudents({
      academicYearId: made.yearId,
      search: "bina",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].student.fullName).toContain("Bina");
  });

  it("refuses to delete a section that still holds students", async () => {
    await expect(deleteSection(made.sectionId)).rejects.toThrow(/enrolled student/i);
  });

  it("suggests an admission number without crashing on non-numeric ones", async () => {
    await expect(suggestAdmissionNo()).resolves.toMatch(/^\d+$/);
  });

  it("offers subjects to a grade with their mark schemes", async () => {
    const maths = await createSubject({ name: "__smoke Maths", code: `SMK${Date.now() % 100000}` });
    const science = await createSubject({ name: "__smoke Science", code: `SSC${Date.now() % 100000}` });
    made.subjectIds.push(maths.id, science.id);

    const theoryOnly = await createOffering({
      subjectId: maths.id,
      gradeId: made.gradeId,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
      // Passed deliberately: they must be discarded because hasPractical is false.
      fullMarksPractical: 25,
      passMarksPractical: 10,
    });
    made.offeringIds.push(theoryOnly.id);

    expect(theoryOnly.fullMarksPractical).toBeNull();
    expect(theoryOnly.passMarksPractical).toBeNull();

    const withPractical = await createOffering({
      subjectId: science.id,
      gradeId: made.gradeId,
      academicYearId: made.yearId,
      hasPractical: true,
      fullMarksTheory: 75,
      passMarksTheory: 27,
      fullMarksPractical: 25,
      passMarksPractical: 10,
    });
    made.offeringIds.push(withPractical.id);

    expect(withPractical.fullMarksPractical).toBe(25);
  });

  it("lists offerings for the year with subject and grade joined", async () => {
    const rows = await listOfferings(made.yearId);
    expect(rows).toHaveLength(2);
    expect(rows[0].grade.name).toBe(GRADE);
    expect(rows.map((r) => r.subject.name).sort()).toEqual([
      "__smoke Maths",
      "__smoke Science",
    ]);
  });

  it("refuses to delete a subject that is still offered", async () => {
    await expect(deleteSubject(made.subjectIds[0])).rejects.toThrow(/remove those offerings/i);
  });

  it("allows deleting an offering with no teacher assignments", async () => {
    const id = made.offeringIds.pop()!;
    await expect(deleteOffering(id)).resolves.toBeTruthy();
    expect(await listOfferings(made.yearId)).toHaveLength(1);
  });

  it("builds a teaching plan listing every offering, assigned or not", async () => {
    const plan = await getSectionTeachingPlan(made.sectionId);
    expect(plan).not.toBeNull();
    expect(plan!.rows).toHaveLength(1);
    expect(plan!.rows[0].assigned).toBeNull();
  });

  it("assigns a subject teacher and reflects it in the plan", async () => {
    await setSubjectTeacher(made.sectionId, made.offeringIds[0], made.staffId);

    const plan = await getSectionTeachingPlan(made.sectionId);
    expect(plan!.rows[0].assigned?.id).toBe(made.staffId);
  });

  it("replaces rather than duplicates when reassigned", async () => {
    const other = await createStaff({
      firstName: "__smoke",
      middleName: "Hari",
      lastName: "Gurung",
      phone: "9833333333",
      designation: "Teacher",
      joinedOn: new Date(Date.UTC(2021, 3, 14)),
    });

    await setSubjectTeacher(made.sectionId, made.offeringIds[0], other.id);

    const rows = await prisma.teacherAssignment.findMany({
      where: { sectionId: made.sectionId, subjectOfferingId: made.offeringIds[0] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].staffId).toBe(other.id);

    await setSubjectTeacher(made.sectionId, made.offeringIds[0], made.staffId);
    await prisma.staff.delete({ where: { id: other.id } });
  });

  it("clears an assignment when given null", async () => {
    await setSubjectTeacher(made.sectionId, made.offeringIds[0], null);
    const count = await prisma.teacherAssignment.count({
      where: { sectionId: made.sectionId },
    });
    expect(count).toBe(0);

    await setSubjectTeacher(made.sectionId, made.offeringIds[0], made.staffId);
  });

  it("refuses an offering belonging to another grade", async () => {
    const otherGrade = await createGrade({ name: "__smoke Class 10", order: 9912 });
    made.otherGradeId = otherGrade.id;

    const otherOffering = await createOffering({
      subjectId: made.subjectIds[0],
      gradeId: otherGrade.id,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    });
    made.otherOfferingId = otherOffering.id;

    // Nothing in the schema prevents this pairing; the service has to.
    await expect(
      setSubjectTeacher(made.sectionId, otherOffering.id, made.staffId),
    ).rejects.toThrow(AssignmentMismatchError);
  });

  it("blocks deleting an offering once a teacher is assigned to it", async () => {
    await expect(deleteOffering(made.offeringIds[0])).rejects.toThrow(
      /teacher assignment/i,
    );
  });

  it("reports teaching load joined across staff, section and subject", async () => {
    const load = await listTeachingLoad(made.yearId);
    expect(load).toHaveLength(1);
    expect(load[0].staff.id).toBe(made.staffId);
    expect(load[0].section.grade.name).toBe(GRADE);
    expect(load[0].subjectOffering.subject.name).toContain("__smoke");
  });
});
