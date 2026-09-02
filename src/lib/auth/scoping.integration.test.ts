import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection, setClassTeacher } from "@/lib/registry/structure";
import { createStaff } from "@/lib/registry/staff";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import { setSubjectTeacher } from "@/lib/registry/assignments";
import { allowedSectionIds, canEnterMarks, canTakeAttendance, type Actor } from "./scope";

// The rules that decide whether one teacher can reach another class's marks.
const made = {
  yearId: 0,
  gradeId: 0,
  mine: 0,
  theirs: 0,
  led: 0,
  staffId: 0,
  otherStaffId: 0,
  subjectIds: [] as number[],
  myOfferingId: 0,
  otherOfferingId: 0,
};

const teacher = (): Actor => ({
  userId: -1,
  username: "__scope",
  role: "TEACHER",
  staffId: made.staffId,
});

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: "2096" })).id;
  made.gradeId = (await createGrade({ name: "__scope Class 8", order: 9971 })).id;

  made.mine = (await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })).id;
  made.theirs = (await createSection({ name: "B", gradeId: made.gradeId, academicYearId: made.yearId })).id;
  made.led = (await createSection({ name: "C", gradeId: made.gradeId, academicYearId: made.yearId })).id;

  const base = {
    phone: "9800000021",
    designation: "Teacher",
    joinedOn: new Date(Date.UTC(2020, 3, 14)),
  };
  made.staffId = (await createStaff({ ...base, firstName: "__scope", lastName: "Mine" })).id;
  made.otherStaffId = (
    await createStaff({ ...base, phone: "9800000022", firstName: "__scope", lastName: "Theirs" })
  ).id;

  const stamp = Date.now() % 100000;
  const maths = await createSubject({ name: `__scope Maths ${stamp}` });
  const science = await createSubject({ name: `__scope Science ${stamp}` });
  made.subjectIds.push(maths.id, science.id);

  const offering = (subjectId: number) =>
    createOffering({
      subjectId,
      gradeId: made.gradeId,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    });

  made.myOfferingId = (await offering(maths.id)).id;
  made.otherOfferingId = (await offering(science.id)).id;

  // Teaches Maths in A only, and is class teacher of C without teaching in it.
  await setSubjectTeacher(made.mine, made.myOfferingId, made.staffId);
  await setSubjectTeacher(made.theirs, made.myOfferingId, made.otherStaffId);
  await setSubjectTeacher(made.mine, made.otherOfferingId, made.otherStaffId);
  await setClassTeacher(made.led, made.staffId);
});

afterAll(async () => {
  await prisma.teacherAssignment.deleteMany({
    where: { sectionId: { in: [made.mine, made.theirs, made.led] } },
  });
  await prisma.section.updateMany({
    where: { id: made.led },
    data: { classTeacherId: null },
  });
  await prisma.section.deleteMany({ where: { id: { in: [made.mine, made.theirs, made.led] } } });
  await prisma.subjectOffering.deleteMany({
    where: { id: { in: [made.myOfferingId, made.otherOfferingId] } },
  });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjectIds } } });
  await prisma.staff.deleteMany({ where: { id: { in: [made.staffId, made.otherStaffId] } } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("teacher scoping", () => {
  it("scopes a teacher to sections they teach in or lead", async () => {
    const allowed = await allowedSectionIds(teacher());
    expect(allowed).not.toBe("all");
    const ids = allowed as number[];
    expect(ids).toContain(made.mine);
    expect(ids).toContain(made.led);
    expect(ids).not.toContain(made.theirs);
  });

  it("leaves office and admin unscoped", async () => {
    for (const role of ["ADMIN", "OFFICE"] as const) {
      expect(await allowedSectionIds({ ...teacher(), role })).toBe("all");
    }
  });

  it("gives an unlinked teacher access to nothing", async () => {
    expect(await allowedSectionIds({ ...teacher(), staffId: null })).toEqual([]);
  });

  it("lets a teacher mark only their own subject in their own section", async () => {
    expect(await canEnterMarks(teacher(), made.mine, made.myOfferingId)).toBe(true);
    // Same subject, a section taught by somebody else.
    expect(await canEnterMarks(teacher(), made.theirs, made.myOfferingId)).toBe(false);
    // Their own section, a subject taught by somebody else.
    expect(await canEnterMarks(teacher(), made.mine, made.otherOfferingId)).toBe(false);
  });

  it("does not let a class teacher mark subjects they do not teach", async () => {
    // Class teacher of C, but assigned no subject in it.
    expect(await canTakeAttendance(teacher(), made.led)).toBe(true);
    expect(await canEnterMarks(teacher(), made.led, made.myOfferingId)).toBe(false);
  });

  it("blocks attendance for a section that is not theirs", async () => {
    expect(await canTakeAttendance(teacher(), made.theirs)).toBe(false);
  });

  it("lets the office take attendance anywhere", async () => {
    expect(await canTakeAttendance({ ...teacher(), role: "OFFICE" }, made.theirs)).toBe(true);
  });
});
