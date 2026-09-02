import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent, updateStudent } from "@/lib/registry/students";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import { createExamTerm, saveMarks, setExamPublished } from "@/lib/assessment/exams";
import { saveSheet } from "@/lib/attendance/attendance";
import { addActivity, addConduct } from "./entries";
import { getHonours, getStudentHonours } from "./honours";

const made = {
  yearId: 0,
  gradeId: 0,
  sectionId: 0,
  subjectId: 0,
  offeringId: 0,
  publishedId: 0,
  draftId: 0,
  students: [] as number[],
};
const BS = 2098;

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
  made.gradeId = (await createGrade({ name: "__hon Class 3", order: 9982 })).id;
  made.sectionId = (
    await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })
  ).id;

  const subject = await createSubject({ name: `__hon Maths ${Date.now() % 100000}` });
  made.subjectId = subject.id;
  made.offeringId = (
    await createOffering({
      subjectId: subject.id,
      gradeId: made.gradeId,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    })
  ).id;

  for (const last of ["Ace", "Bee", "Cee", "Dee"]) {
    const s = await createStudent({
      admissionNo: `__hon-${Date.now()}-${last}`,
      firstName: "__hon",
      lastName: last,
      dob: new Date(Date.UTC(2015, 0, 1)),
      gender: "MALE",
      admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
      guardians: [{ relation: "FATHER", fullName: "__hon Dad", phone: "9800000041" }],
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    });
    made.students.push(s.id);
  }
  const [ace, bee, cee] = made.students;

  made.publishedId = (await createExamTerm({ academicYearId: made.yearId, name: "First Terminal" })).id;
  made.draftId = (await createExamTerm({ academicYearId: made.yearId, name: "Second Terminal" })).id;

  // Ace 90, Bee 70, Cee 50, Dee has no mark, so Dee is unranked.
  await saveMarks(made.publishedId, made.sectionId, made.offeringId, [
    { studentId: ace, theory: 90, practical: null, isAbsent: false },
    { studentId: bee, theory: 70, practical: null, isAbsent: false },
    { studentId: cee, theory: 50, practical: null, isAbsent: false },
  ]);
  await setExamPublished(made.publishedId, true);
  // The draft term would flip the order if it counted.
  await saveMarks(made.draftId, made.sectionId, made.offeringId, [
    { studentId: ace, theory: 10, practical: null, isAbsent: false },
    { studentId: bee, theory: 100, practical: null, isAbsent: false },
  ]);

  // One roll call: Ace absent, the rest present. Dee has no record at all.
  await saveSheet({
    sectionId: made.sectionId,
    date: bsToAd({ year: BS, month: 1, day: 5 }),
    takenById: null,
    entries: [
      { studentId: ace, status: "ABSENT" },
      { studentId: bee, status: "PRESENT" },
      { studentId: cee, status: "LATE" },
    ],
  });

  const base = {
    academicYearId: made.yearId,
    recordedById: null,
    date: bsToAd({ year: BS, month: 1, day: 9 }),
  };
  await addConduct({ ...base, studentId: cee, kind: "MERIT", points: 20, note: "Class monitor" });
  await addConduct({ ...base, studentId: ace, kind: "DEMERIT", points: 10, note: "Fighting" });
  await addActivity({ ...base, studentId: bee, name: "Quiz", level: "WON", points: 30 });
});

afterAll(async () => {
  await prisma.conductEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.activityEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.attendanceSession.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.mark.deleteMany({ where: { examTermId: { in: [made.publishedId, made.draftId] } } });
  await prisma.examTerm.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.students } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.students } } });
  await prisma.student.deleteMany({ where: { id: { in: made.students } } });
  await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  await prisma.section.deleteMany({ where: { id: made.sectionId } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("honours", () => {
  it("scores and ranks a section from published exams, attendance, conduct and activities", async () => {
    const honours = await getHonours(made.yearId);
    expect(honours).not.toBeNull();
    expect(honours!.publishedTerms).toBe(1);
    expect(honours!.sections).toHaveLength(1);

    const section = honours!.sections[0];
    expect(section.gradeName).toBe("__hon Class 3");
    expect(section.sectionName).toBe("A");
    const [ace, bee, cee, dee] = made.students;
    const by = new Map(section.students.map((s) => [s.studentId, s]));

    // Ace: exams 90, attendance 0, conduct 70, activities 0.
    expect(by.get(ace)!.pillars).toEqual({ exams: 90, attendance: 0, conduct: 70, activities: 0 });
    // Bee: exams 70 (the draft 100 is ignored), attendance 100, conduct 80, activities 30.
    expect(by.get(bee)!.pillars).toEqual({ exams: 70, attendance: 100, conduct: 80, activities: 30 });
    // Cee: late counts as attended.
    expect(by.get(cee)!.pillars).toEqual({ exams: 50, attendance: 100, conduct: 100, activities: 0 });
    // Dee: nothing published for them, no roll call.
    expect(by.get(dee)!.pillars).toEqual({ exams: null, attendance: null, conduct: 80, activities: 0 });

    const w = honours!.weights;
    const expected = (p: { exams: number; attendance: number; conduct: number; activities: number }) =>
      Math.round(
        ((w.exams * p.exams + w.attendance * p.attendance + w.conduct * p.conduct + w.activities * p.activities) /
          (w.exams + w.attendance + w.conduct + w.activities)) *
          10,
      ) / 10;
    expect(by.get(ace)!.overall).toBe(expected({ exams: 90, attendance: 0, conduct: 70, activities: 0 }));
    expect(by.get(bee)!.overall).toBe(expected({ exams: 70, attendance: 100, conduct: 80, activities: 30 }));
    expect(by.get(dee)!.overall).toBeNull();
    expect(by.get(dee)!.position).toBeNull();

    // Ranked ones come first in position order, then the unranked.
    const order = section.students.map((s) => s.studentId);
    expect(order[3]).toBe(dee);
    const ranked = section.students.slice(0, 3);
    expect(ranked.map((s) => s.position)).toEqual([1, 2, 3]);
    expect([...ranked].sort((a, b) => b.overall! - a.overall!).map((s) => s.studentId)).toEqual(
      ranked.map((s) => s.studentId),
    );
  });

  it("agrees with the student view and carries the entries", async () => {
    const [ace, bee] = made.students;
    const all = await getHonours(made.yearId);
    const mine = await getStudentHonours(bee, made.yearId);
    expect(mine).not.toBeNull();
    const row = all!.sections[0].students.find((s) => s.studentId === bee)!;
    expect(mine!.overall).toBe(row.overall);
    expect(mine!.position).toBe(row.position);
    expect(mine!.classSize).toBe(4);
    expect(mine!.pillars).toEqual(row.pillars);
    expect(mine!.activities.map((a) => a.name)).toEqual(["Quiz"]);
    expect(mine!.conduct).toEqual([]);

    const theirs = await getStudentHonours(ace, made.yearId);
    expect(theirs!.conduct.map((c) => c.note)).toEqual(["Fighting"]);
  });

  it("leaves out students who are not active", async () => {
    const [, , cee] = made.students;
    const student = await prisma.student.findUniqueOrThrow({ where: { id: cee } });
    await updateStudent(cee, {
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      middleName: student.middleName,
      lastName: student.lastName,
      fullNameNp: student.fullNameNp,
      dob: student.dob,
      gender: student.gender,
      address: student.address,
      admittedOn: student.admittedOn,
      status: "LEFT",
    });
    try {
      const honours = await getHonours(made.yearId);
      const ids = honours!.sections[0].students.map((s) => s.studentId);
      expect(ids).not.toContain(cee);
      expect(ids).toHaveLength(3);
    } finally {
      await prisma.student.update({ where: { id: cee }, data: { status: "ACTIVE" } });
    }
  });

  it("returns null for an unknown year and nothing for an unknown student", async () => {
    expect(await getHonours(-1)).toBeNull();
    expect(await getStudentHonours(-1, made.yearId)).toBeNull();
  });
});
