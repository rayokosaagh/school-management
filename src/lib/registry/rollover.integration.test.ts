import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createAcademicYear, setCurrentAcademicYear } from "./academic-year";
import { planRollover } from "./rollover";
import type { RolloverOptions } from "./rollover-plan";

// Talks to the real database. Everything it makes is torn down afterwards, and
// it touches nothing it did not create.
const made = {
  sourceYearId: 0,
  targetYearId: 0,
  gradeIds: [] as number[],
  sectionIds: [] as number[],
  subjectIds: [] as number[],
  offeringIds: [] as number[],
  staffIds: [] as number[],
  studentIds: [] as number[],
  previousCurrentYearId: null as number | null,
};

const SOURCE = "2091";
const TARGET = "2092";
const LOWER = "__rollover Class 9";
const UPPER = "__rollover Class 10";

function options(over: Partial<RolloverOptions> = {}): RolloverOptions {
  return {
    copyOfferings: true,
    copyAssignments: true,
    copyTimetable: true,
    rollOrder: "ALPHABETICAL",
    markOrderExamTermId: null,
    decisions: {},
    placements: {},
    makeTargetCurrent: false,
    ...over,
  };
}

beforeAll(async () => {
  if (!process.env.DB_TESTS) return;

  const current = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  made.previousCurrentYearId = current?.id ?? null;

  const source = await createAcademicYear({ nameBS: SOURCE });
  const target = await createAcademicYear({ nameBS: TARGET });
  made.sourceYearId = source.id;
  made.targetYearId = target.id;

  // Grade order is global, so these sit above anything the app already has.
  const highest = await prisma.grade.findFirst({ orderBy: { order: "desc" } });
  const base = (highest?.order ?? -1) + 1;
  const lower = await prisma.grade.create({ data: { name: LOWER, order: base } });
  const upper = await prisma.grade.create({ data: { name: UPPER, order: base + 1 } });
  made.gradeIds.push(lower.id, upper.id);

  const staff = await prisma.staff.create({
    data: {
      firstName: "Rollover",
      lastName: "Teacher",
      fullName: "Rollover Teacher",
      phone: "9800000000",
      designation: "Teacher",
      joinedOn: new Date("2023-01-01"),
    },
  });
  made.staffIds.push(staff.id);

  for (const [grade, name] of [
    [lower.id, "A"],
    [lower.id, "B"],
    [upper.id, "A"],
    [upper.id, "B"],
  ] as const) {
    const section = await prisma.section.create({
      data: {
        name,
        gradeId: grade,
        academicYearId: source.id,
        classTeacherId: grade === lower.id && name === "A" ? staff.id : null,
      },
    });
    made.sectionIds.push(section.id);
  }

  const subject = await prisma.subject.create({ data: { name: "__rollover Maths" } });
  made.subjectIds.push(subject.id);
  const offering = await prisma.subjectOffering.create({
    data: {
      subjectId: subject.id,
      gradeId: lower.id,
      academicYearId: source.id,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    },
  });
  made.offeringIds.push(offering.id);

  const assignment = await prisma.teacherAssignment.create({
    data: { staffId: staff.id, sectionId: made.sectionIds[0]!, subjectOfferingId: offering.id },
  });
  const period = await prisma.schoolPeriod.findFirst({ orderBy: { order: "asc" } });
  if (period) {
    await prisma.timetablePeriod.create({
      data: {
        teacherAssignmentId: assignment.id,
        sectionId: made.sectionIds[0]!,
        schoolPeriodId: period.id,
        dayOfWeek: 0,
        room: "R1",
      },
    });
  }

  // Two students in the lower A section, deliberately out of alphabetical order.
  for (const [i, name] of ["Zenith Rai", "Anisha Gurung"].entries()) {
    const student = await prisma.student.create({
      data: {
        admissionNo: `__ro-${i}`,
        firstName: name.split(" ")[0]!,
        lastName: name.split(" ")[1]!,
        fullName: name,
        dob: new Date("2012-01-01"),
        gender: "MALE",
        admittedOn: new Date("2023-01-01"),
      },
    });
    made.studentIds.push(student.id);
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        sectionId: made.sectionIds[0]!,
        academicYearId: source.id,
        rollNo: i + 1,
        enrolledOn: new Date("2023-01-01"),
      },
    });
  }
});

afterAll(async () => {
  if (!process.env.DB_TESTS) return;

  const years = [made.sourceYearId, made.targetYearId].filter(Boolean);
  await prisma.timetablePeriod.deleteMany({
    where: { section: { academicYearId: { in: years } } },
  });
  await prisma.teacherAssignment.deleteMany({
    where: { section: { academicYearId: { in: years } } },
  });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  await prisma.subjectOffering.deleteMany({ where: { academicYearId: { in: years } } });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjectIds } } });
  await prisma.section.deleteMany({ where: { academicYearId: { in: years } } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staffIds } } });
  await prisma.grade.deleteMany({ where: { id: { in: made.gradeIds } } });
  await prisma.academicYear.deleteMany({ where: { id: { in: years } } });

  // Deleting the fixture years would otherwise leave the school with no current
  // year at all, which blanks every page.
  if (made.previousCurrentYearId !== null) {
    const still = await prisma.academicYear.findUnique({
      where: { id: made.previousCurrentYearId },
      select: { id: true },
    });
    if (still) await setCurrentAcademicYear(made.previousCurrentYearId);
  }
  await prisma.$disconnect();
});

// Needs a live database, so it is opt-in: DB_TESTS=1 npx vitest run
describe.skipIf(!process.env.DB_TESTS)("rollover planning", () => {
  it("counts everything the run would create", async () => {
    const plan = await planRollover(made.sourceYearId, made.targetYearId, options());

    expect(plan.sections).toMatchObject({ create: 4, existing: 0 });
    expect(plan.offerings).toMatchObject({ create: 1, existing: 0 });
    expect(plan.assignments).toMatchObject({ create: 1, existing: 0 });
    expect(plan.blockers).toEqual([]);
  });

  it("promotes the lower grade and graduates the upper one", async () => {
    const plan = await planRollover(made.sourceYearId, made.targetYearId, options());

    expect(plan.students.promote).toHaveLength(2);
    expect(plan.students.promote.map((s) => s.toLabel)).toEqual([
      `${UPPER} A`,
      `${UPPER} A`,
    ]);
    expect(plan.students.graduate).toEqual([]);
  });

  it("orders the new rolls alphabetically", async () => {
    const plan = await planRollover(made.sourceYearId, made.targetYearId, options());
    const rolls = plan.students.promote.map((s) => [s.fullName, s.rollNo]);

    expect(rolls).toEqual([
      ["Anisha Gurung", 1],
      ["Zenith Rai", 2],
    ]);
  });
});
