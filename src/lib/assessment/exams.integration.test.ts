import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent } from "@/lib/registry/students";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import {
  AssessmentError,
  createExamTerm,
  deleteExamTerm,
  getLedger,
  getMarksSheet,
  getStudentMarksheets,
  saveMarks,
  setExamPublished,
} from "./exams";

const made = {
  yearId: 0,
  gradeId: 0,
  otherGradeId: 0,
  sectionId: 0,
  subjectIds: [] as number[],
  offeringIds: [] as number[],
  strayOfferingId: 0,
  termIds: [] as number[],
  studentIds: [] as number[],
};

const BS = 2095;

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
  made.gradeId = (await createGrade({ name: "__exam Class 6", order: 9961 })).id;
  made.otherGradeId = (await createGrade({ name: "__exam Class 7", order: 9962 })).id;
  made.sectionId = (
    await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })
  ).id;

  const stamp = Date.now() % 100000;
  const maths = await createSubject({ name: `__exam Maths ${stamp}` });
  const science = await createSubject({ name: `__exam Science ${stamp}` });
  made.subjectIds.push(maths.id, science.id);

  // Theory only, out of 100, pass 40.
  made.offeringIds.push(
    (
      await createOffering({
        subjectId: maths.id,
        gradeId: made.gradeId,
        academicYearId: made.yearId,
        hasPractical: false,
        fullMarksTheory: 100,
        passMarksTheory: 40,
      })
    ).id,
  );
  // Theory 75 pass 27, practical 25 pass 10.
  made.offeringIds.push(
    (
      await createOffering({
        subjectId: science.id,
        gradeId: made.gradeId,
        academicYearId: made.yearId,
        hasPractical: true,
        fullMarksTheory: 75,
        passMarksTheory: 27,
        fullMarksPractical: 25,
        passMarksPractical: 10,
      })
    ).id,
  );
  // Belongs to another grade; must never be accepted for this section.
  made.strayOfferingId = (
    await createOffering({
      subjectId: maths.id,
      gradeId: made.otherGradeId,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    })
  ).id;

  made.termIds.push((await createExamTerm({ academicYearId: made.yearId, name: "First Terminal" })).id);
  made.termIds.push((await createExamTerm({ academicYearId: made.yearId, name: "Final" })).id);

  for (const last of ["Alpha", "Bravo", "Charlie"]) {
    const student = await createStudent({
      admissionNo: `__exam-${Date.now()}-${last}`,
      firstName: "__exam",
      lastName: last,
      dob: new Date(Date.UTC(2012, 0, 1)),
      gender: "MALE",
      admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
      guardians: [{ relation: "FATHER", fullName: "__exam Dad", phone: "9800000011" }],
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    });
    made.studentIds.push(student.id);
  }
});

afterAll(async () => {
  await prisma.mark.deleteMany({ where: { examTermId: { in: made.termIds } } });
  await prisma.examTerm.deleteMany({ where: { id: { in: made.termIds } } });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  await prisma.subjectOffering.deleteMany({
    where: { id: { in: [...made.offeringIds, made.strayOfferingId] } },
  });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjectIds } } });
  await prisma.section.deleteMany({ where: { id: made.sectionId } });
  await prisma.grade.deleteMany({ where: { id: { in: [made.gradeId, made.otherGradeId] } } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("exams and marks", () => {
  it("orders exam terms as they were created", async () => {
    const terms = await prisma.examTerm.findMany({
      where: { id: { in: made.termIds } },
      orderBy: { order: "asc" },
    });
    expect(terms.map((t) => t.name)).toEqual(["First Terminal", "Final"]);
    expect(terms.map((t) => t.order)).toEqual([0, 1]);
  });

  it("returns a blank sheet for every enrolled student", async () => {
    const sheet = await getMarksSheet(made.termIds[0], made.sectionId, made.offeringIds[0]);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows.every((r) => r.theory === null && !r.isAbsent)).toBe(true);
    expect(sheet.locked).toBe(false);
  });

  it("refuses a subject taught to another grade", async () => {
    await expect(
      getMarksSheet(made.termIds[0], made.sectionId, made.strayOfferingId),
    ).rejects.toThrow(AssessmentError);
  });

  it("saves marks and reads them back", async () => {
    await saveMarks(made.termIds[0], made.sectionId, made.offeringIds[0], [
      { studentId: made.studentIds[0], theory: 92, practical: null, isAbsent: false },
      { studentId: made.studentIds[1], theory: 45, practical: null, isAbsent: false },
      { studentId: made.studentIds[2], theory: null, practical: null, isAbsent: true },
    ]);

    const sheet = await getMarksSheet(made.termIds[0], made.sectionId, made.offeringIds[0]);
    const byId = new Map(sheet.rows.map((r) => [r.studentId, r]));
    expect(byId.get(made.studentIds[0])?.theory).toBe(92);
    expect(byId.get(made.studentIds[2])?.isAbsent).toBe(true);
    expect(byId.get(made.studentIds[2])?.theory).toBeNull();
  });

  it("rejects a mark above the paper's full marks", async () => {
    await expect(
      saveMarks(made.termIds[0], made.sectionId, made.offeringIds[0], [
        { studentId: made.studentIds[0], theory: 101, practical: null, isAbsent: false },
      ]),
    ).rejects.toThrow(/between 0 and 100/);
  });

  it("rejects a practical above its own full marks", async () => {
    await expect(
      saveMarks(made.termIds[0], made.sectionId, made.offeringIds[1], [
        { studentId: made.studentIds[0], theory: 50, practical: 30, isAbsent: false },
      ]),
    ).rejects.toThrow(/between 0 and 25/);
  });

  it("refuses a student who is not in the section", async () => {
    await expect(
      saveMarks(made.termIds[0], made.sectionId, made.offeringIds[0], [
        { studentId: 999999, theory: 50, practical: null, isAbsent: false },
      ]),
    ).rejects.toThrow(AssessmentError);
  });

  it("removes a mark when the row is emptied", async () => {
    await saveMarks(made.termIds[0], made.sectionId, made.offeringIds[0], [
      { studentId: made.studentIds[1], theory: null, practical: null, isAbsent: false },
    ]);
    const count = await prisma.mark.count({
      where: {
        examTermId: made.termIds[0],
        subjectOfferingId: made.offeringIds[0],
        studentId: made.studentIds[1],
      },
    });
    expect(count).toBe(0);
  });

  it("withholds GPA and position while any subject is unmarked", async () => {
    const ledger = await getLedger(made.termIds[0], made.sectionId);
    const top = ledger.students.find((s) => s.studentId === made.studentIds[0]);
    // Maths is in, Science is not.
    expect(top?.overall.complete).toBe(false);
    expect(top?.overall.gpa).toBeNull();
    expect(top?.position).toBeNull();
  });

  it("computes GPA and position once every subject is in", async () => {
    await saveMarks(made.termIds[0], made.sectionId, made.offeringIds[0], [
      { studentId: made.studentIds[0], theory: 92, practical: null, isAbsent: false },
      { studentId: made.studentIds[1], theory: 60, practical: null, isAbsent: false },
      { studentId: made.studentIds[2], theory: 40, practical: null, isAbsent: false },
    ]);
    await saveMarks(made.termIds[0], made.sectionId, made.offeringIds[1], [
      { studentId: made.studentIds[0], theory: 70, practical: 22, isAbsent: false },
      { studentId: made.studentIds[1], theory: 40, practical: 15, isAbsent: false },
      { studentId: made.studentIds[2], theory: 30, practical: 12, isAbsent: false },
    ]);

    const ledger = await getLedger(made.termIds[0], made.sectionId);
    const rows = ledger.students;
    const first = rows.find((s) => s.studentId === made.studentIds[0]);

    expect(first?.overall.complete).toBe(true);
    expect(first?.grandTotal).toBe(92 + 92);
    expect(first?.position).toBe(1);
    expect(first?.overall.passedAll).toBe(true);

    // Positions run 1,2,3 by grand total.
    const ordered = [...rows].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    expect(ordered.map((s) => s.studentId)).toEqual(made.studentIds);
  });

  it("locks marks once the exam is published", async () => {
    await setExamPublished(made.termIds[0], true);
    const sheet = await getMarksSheet(made.termIds[0], made.sectionId, made.offeringIds[0]);
    expect(sheet.locked).toBe(true);

    await expect(
      saveMarks(made.termIds[0], made.sectionId, made.offeringIds[0], [
        { studentId: made.studentIds[0], theory: 10, practical: null, isAbsent: false },
      ]),
    ).rejects.toThrow(/published/i);

    await setExamPublished(made.termIds[0], false);
  });

  it("refuses to delete an exam that already holds marks", async () => {
    await expect(deleteExamTerm(made.termIds[0])).rejects.toThrow(/mark/i);
  });

  it("deletes an exam with no marks", async () => {
    await expect(deleteExamTerm(made.termIds[1])).resolves.toBeTruthy();
    made.termIds.pop();
  });
});

describe.skipIf(!process.env.DB_TESTS)("student marksheets", () => {
  it("returns nothing for a student not enrolled in the current year", async () => {
    // The fixture year above is not the school's current one.
    expect(await getStudentMarksheets(made.studentIds[0])).toBeNull();
  });

  it("builds a marksheet per exam with marks, keeping position and GPA", async () => {
    // Marksheets are scoped to the current year, so the fixture year has to be
    // made current for the length of this test and put back afterwards.
    const previous = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
    try {
      await prisma.academicYear.updateMany({ data: { isCurrent: false } });
      await prisma.academicYear.update({
        where: { id: made.yearId },
        data: { isCurrent: true },
      });

      const sheets = await getStudentMarksheets(made.studentIds[0]);
      expect(sheets).not.toBeNull();

      // Only the exam that actually holds marks appears; the empty one is skipped.
      expect(sheets!.sheets).toHaveLength(1);
      const sheet = sheets!.sheets[0];
      expect(sheet.term.name).toBe("First Terminal");
      expect(sheet.classSize).toBe(3);

      expect(sheet.result.overall.complete).toBe(true);
      expect(sheet.result.grandTotal).toBe(92 + 92);
      expect(sheet.result.position).toBe(1);

      // Both subjects are listed, and the raw marks are echoed for printing.
      expect(sheet.result.subjects).toHaveLength(2);
      const science = sheet.result.subjects.find((x) => x.subject.includes("Science"));
      expect(science?.result.theory).toBe(70);
      expect(science?.result.practical).toBe(22);

      // The practical column is driven by the offering, not guessed from marks.
      expect(sheet.offerings.some((o) => o.hasPractical)).toBe(true);
    } finally {
      await prisma.academicYear.updateMany({ data: { isCurrent: false } });
      if (previous) {
        // updateMany rather than update: the year that was current may have
        // been another suite's fixture and already deleted.
        await prisma.academicYear.updateMany({
          where: { id: previous.id },
          data: { isCurrent: true },
        });
      }
    }
  });
});
