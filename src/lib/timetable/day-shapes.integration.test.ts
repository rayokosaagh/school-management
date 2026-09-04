import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { setSubjectTeacher } from "@/lib/registry/assignments";
import { createStaff } from "@/lib/registry/staff";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import {
  DayShapeError,
  assignWeekday,
  createDayShape,
  deleteDayShape,
  listDayShapes,
  orphanedLessons,
  renameDayShape,
} from "./day-shapes";

// Saturday carries zero real TimetablePeriod rows under the school's default
// working week (Sunday-Friday) — verified against the live database before
// writing this suite. It is the only weekday these tests may pass to
// assignWeekday: that function deletes whatever it finds on the day it is
// given, with no section filter, so running it against a real working day
// would strand the actual school's timetable.
const TEST_DAY = 6;
// Sunday is a real working day, used only to prove assignWeekday leaves other
// days alone. The lesson placed here belongs to this suite's own isolated
// section and teacher, so it cannot collide with the real timetable.
const CONTROL_DAY = 0;

const made = {
  yearId: 0,
  gradeId: 0,
  sectionIds: [] as number[],
  staffIds: [] as number[],
  subjectId: 0,
  offeringId: 0,
  assignmentIds: [] as number[],
  dayShapeIds: [] as number[],
  schoolPeriodIds: [] as number[],
};

beforeAll(async () => {
  const stamp = Date.now() % 100000;
  // Same stamp-based spread other timetable suites use for nameBS, which is
  // unique and shared across a database several suites write to.
  made.yearId = (await createAcademicYear({ nameBS: String(2000 + (stamp % 100)) })).id;
  made.gradeId = (
    await createGrade({ name: `__dayshapes Class ${stamp}`, order: 940000 + stamp })
  ).id;

  for (const name of ["A", "B"]) {
    made.sectionIds.push(
      (
        await createSection({ name, gradeId: made.gradeId, academicYearId: made.yearId })
      ).id,
    );
  }

  const staffBase = { designation: "Teacher", joinedOn: new Date(Date.UTC(2020, 3, 14)) };
  for (const [i, lastName] of ["One", "Two"].entries()) {
    made.staffIds.push(
      (
        await createStaff({
          ...staffBase,
          firstName: "__dayshapes",
          lastName,
          phone: `7${i}${String(stamp).padStart(8, "0")}`,
        })
      ).id,
    );
  }

  made.subjectId = (await createSubject({ name: `__dayshapes Maths ${stamp}` })).id;
  made.offeringId = (
    await createOffering({
      subjectId: made.subjectId,
      gradeId: made.gradeId,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    })
  ).id;

  made.assignmentIds.push(
    (await setSubjectTeacher(made.sectionIds[0], made.offeringId, made.staffIds[0]))!.id,
    (await setSubjectTeacher(made.sectionIds[1], made.offeringId, made.staffIds[1]))!.id,
  );
});

afterAll(async () => {
  // Weekday assignments first: WeekdayShape -> DayShape is ON DELETE RESTRICT,
  // so a shape cannot go while day 6 still points at it.
  await prisma.weekdayShape.deleteMany({ where: { dayOfWeek: TEST_DAY } });
  await prisma.timetablePeriod.deleteMany({
    where: { OR: [{ schoolPeriodId: { in: made.schoolPeriodIds } }, { sectionId: { in: made.sectionIds } }] },
  });
  await prisma.schoolPeriod.deleteMany({ where: { id: { in: made.schoolPeriodIds } } });
  await prisma.dayShape.deleteMany({ where: { id: { in: made.dayShapeIds } } });
  await prisma.teacherAssignment.deleteMany({ where: { id: { in: made.assignmentIds } } });
  await prisma.section.deleteMany({ where: { id: { in: made.sectionIds } } });
  await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staffIds } } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("createDayShape", () => {
  it("rejects a blank name", async () => {
    await expect(createDayShape("   ")).rejects.toThrow(DayShapeError);
  });

  it("rejects a name already in use", async () => {
    const shape = await createDayShape(`__dayshapes dup ${Date.now()}`);
    made.dayShapeIds.push(shape.id);
    await expect(createDayShape(shape.name)).rejects.toThrow(/already exists/i);
  });

  it("clones another shape's periods as its own rows", async () => {
    const stamp = Date.now();
    const source = await createDayShape(`__dayshapes source ${stamp}`);
    made.dayShapeIds.push(source.id);
    const sourcePeriods = await prisma.schoolPeriod.createManyAndReturn({
      data: [
        { dayShapeId: source.id, order: 0, name: "P1", startMinute: 600, endMinute: 645 },
        { dayShapeId: source.id, order: 1, name: "P2", startMinute: 645, endMinute: 690 },
      ],
    });
    made.schoolPeriodIds.push(...sourcePeriods.map((p) => p.id));

    const clone = await createDayShape(`__dayshapes clone ${stamp}`, source.id);
    made.dayShapeIds.push(clone.id);
    made.schoolPeriodIds.push(...clone.periods.map((p) => p.id));

    expect(clone.periods).toHaveLength(2);
    expect(clone.periods.map((p) => p.name)).toEqual(["P1", "P2"]);
    // Independent rows, not the same periods: cloning is a copy, so editing
    // the clone later cannot reach back and change the source.
    expect(clone.periods.map((p) => p.id)).not.toEqual(sourcePeriods.map((p) => p.id));
  });

  it("refuses to clone from a shape that does not exist", async () => {
    await expect(createDayShape(`__dayshapes orphan ${Date.now()}`, -1)).rejects.toThrow(
      DayShapeError,
    );
  });
});

describe.skipIf(!process.env.DB_TESTS)("renameDayShape", () => {
  it("renames a shape", async () => {
    const shape = await createDayShape(`__dayshapes rename-me ${Date.now()}`);
    made.dayShapeIds.push(shape.id);
    const newName = `__dayshapes renamed ${Date.now()}`;
    await renameDayShape(shape.id, newName);
    const found = (await listDayShapes()).find((s) => s.id === shape.id);
    expect(found?.name).toBe(newName);
  });

  it("refuses to rename onto a name already in use", async () => {
    const stamp = Date.now();
    const a = await createDayShape(`__dayshapes rn-a ${stamp}`);
    const b = await createDayShape(`__dayshapes rn-b ${stamp}`);
    made.dayShapeIds.push(a.id, b.id);
    await expect(renameDayShape(b.id, a.name)).rejects.toThrow(/already exists/i);
  });
});

describe.skipIf(!process.env.DB_TESTS)("orphanedLessons and assignWeekday", () => {
  it("counts exactly the lessons a narrower shape would strand, and assigning deletes precisely those", async () => {
    const stamp = Date.now();

    const shapeA = await createDayShape(`__dayshapes wide ${stamp}`);
    made.dayShapeIds.push(shapeA.id);
    const shapeAPeriods = await prisma.schoolPeriod.createManyAndReturn({
      data: [
        { dayShapeId: shapeA.id, order: 0, name: "P1", startMinute: 600, endMinute: 645 },
        { dayShapeId: shapeA.id, order: 1, name: "P2", startMinute: 645, endMinute: 690 },
      ],
    });
    made.schoolPeriodIds.push(...shapeAPeriods.map((p) => p.id));
    const [p1A, p2A] = shapeAPeriods;

    // The narrower shape: cloned from A, then trimmed down to one period —
    // exactly how "Half day" is meant to start life.
    const shapeB = await createDayShape(`__dayshapes narrow ${stamp}`, shapeA.id);
    made.dayShapeIds.push(shapeB.id);
    made.schoolPeriodIds.push(...shapeB.periods.map((p) => p.id));
    const p1B = shapeB.periods.find((p) => p.name === "P1")!;
    const p2B = shapeB.periods.find((p) => p.name === "P2")!;
    await prisma.schoolPeriod.delete({ where: { id: p2B.id } });

    // Three lessons on the test day sit on shape A's periods; a fourth
    // already sits on shape B's own surviving period and must not be touched.
    await prisma.timetablePeriod.createMany({
      data: [
        {
          teacherAssignmentId: made.assignmentIds[0],
          sectionId: made.sectionIds[0],
          schoolPeriodId: p1A.id,
          dayOfWeek: TEST_DAY,
        },
        {
          teacherAssignmentId: made.assignmentIds[0],
          sectionId: made.sectionIds[0],
          schoolPeriodId: p2A.id,
          dayOfWeek: TEST_DAY,
        },
        {
          teacherAssignmentId: made.assignmentIds[1],
          sectionId: made.sectionIds[1],
          schoolPeriodId: p1A.id,
          dayOfWeek: TEST_DAY,
        },
        {
          teacherAssignmentId: made.assignmentIds[0],
          sectionId: made.sectionIds[0],
          schoolPeriodId: p1B.id,
          dayOfWeek: TEST_DAY,
        },
      ],
    });

    // A control lesson on a real working day, in this suite's own isolated
    // section and period, proves assignWeekday only ever touches TEST_DAY.
    await prisma.timetablePeriod.create({
      data: {
        teacherAssignmentId: made.assignmentIds[0],
        sectionId: made.sectionIds[0],
        schoolPeriodId: p1A.id,
        dayOfWeek: CONTROL_DAY,
      },
    });

    const preview = await orphanedLessons(TEST_DAY, shapeB.id);
    expect(preview.count).toBe(3);
    expect(preview.sections.map((s) => s.id).sort()).toEqual(
      [...made.sectionIds].sort(),
    );

    const result = await assignWeekday(TEST_DAY, shapeB.id);
    expect(result.deletedLessons).toBe(3);

    const remainingOnTestDay = await prisma.timetablePeriod.findMany({
      where: { dayOfWeek: TEST_DAY, sectionId: { in: made.sectionIds } },
      select: { schoolPeriodId: true },
    });
    // Only the lesson already on shape B's own period survived.
    expect(remainingOnTestDay).toEqual([{ schoolPeriodId: p1B.id }]);

    const controlStillThere = await prisma.timetablePeriod.findFirst({
      where: { dayOfWeek: CONTROL_DAY, sectionId: made.sectionIds[0], schoolPeriodId: p1A.id },
    });
    expect(controlStillThere).not.toBeNull();

    const weekdayRow = await prisma.weekdayShape.findUnique({ where: { dayOfWeek: TEST_DAY } });
    expect(weekdayRow?.dayShapeId).toBe(shapeB.id);

    // A second orphan check against the shape now running the day finds
    // nothing left to strand — the write and the preview cannot disagree.
    const after = await orphanedLessons(TEST_DAY, shapeB.id);
    expect(after.count).toBe(0);

    // This test's own surviving lesson would otherwise leak into later tests
    // that reuse TEST_DAY.
    await prisma.timetablePeriod.deleteMany({
      where: { dayOfWeek: TEST_DAY, sectionId: { in: made.sectionIds } },
    });
  });

  it("reports zero and deletes nothing when the shape already covers every lesson on the day", async () => {
    const stamp = Date.now();
    const shape = await createDayShape(`__dayshapes noop ${stamp}`);
    made.dayShapeIds.push(shape.id);
    const period = await prisma.schoolPeriod.create({
      data: { dayShapeId: shape.id, order: 0, name: "P1", startMinute: 600, endMinute: 645 },
    });
    made.schoolPeriodIds.push(period.id);

    await prisma.timetablePeriod.create({
      data: {
        teacherAssignmentId: made.assignmentIds[0],
        sectionId: made.sectionIds[0],
        schoolPeriodId: period.id,
        dayOfWeek: TEST_DAY,
      },
    });

    const preview = await orphanedLessons(TEST_DAY, shape.id);
    expect(preview).toEqual({ count: 0, sections: [] });

    const result = await assignWeekday(TEST_DAY, shape.id);
    expect(result.deletedLessons).toBe(0);

    const stillThere = await prisma.timetablePeriod.findFirst({
      where: { dayOfWeek: TEST_DAY, schoolPeriodId: period.id },
    });
    expect(stillThere).not.toBeNull();

    await prisma.timetablePeriod.deleteMany({
      where: { dayOfWeek: TEST_DAY, sectionId: { in: made.sectionIds } },
    });
  });

  it("refuses a day outside 0-6", async () => {
    const shape = await createDayShape(`__dayshapes badday ${Date.now()}`);
    made.dayShapeIds.push(shape.id);
    await expect(assignWeekday(7, shape.id)).rejects.toThrow(DayShapeError);
    await expect(assignWeekday(-1, shape.id)).rejects.toThrow(DayShapeError);
  });

  it("refuses a shape that does not exist", async () => {
    await expect(assignWeekday(TEST_DAY, -1)).rejects.toThrow(DayShapeError);
  });
});

describe.skipIf(!process.env.DB_TESTS)("deleteDayShape", () => {
  it("refuses the default shape", async () => {
    const defaultShape = await prisma.dayShape.findFirstOrThrow({ where: { isDefault: true } });
    await expect(deleteDayShape(defaultShape.id)).rejects.toThrow(/default/i);
  });

  it("refuses a shape a weekday is assigned to", async () => {
    const stamp = Date.now();
    const shape = await createDayShape(`__dayshapes inuse ${stamp}`);
    made.dayShapeIds.push(shape.id);
    await assignWeekday(TEST_DAY, shape.id);

    await expect(deleteDayShape(shape.id)).rejects.toThrow(/weekday/i);

    // Release the day so afterAll's cleanup order (weekday rows first, then
    // shapes) holds even though this test intentionally leaves one assigned.
    const fallback = await createDayShape(`__dayshapes fallback ${stamp}`);
    made.dayShapeIds.push(fallback.id);
    await assignWeekday(TEST_DAY, fallback.id);
  });

  it("deletes a shape and its periods once nothing depends on it", async () => {
    const shape = await createDayShape(`__dayshapes deletable ${Date.now()}`);
    const period = await prisma.schoolPeriod.create({
      data: { dayShapeId: shape.id, order: 0, name: "P1", startMinute: 600, endMinute: 645 },
    });

    await deleteDayShape(shape.id);

    expect(await prisma.dayShape.findUnique({ where: { id: shape.id } })).toBeNull();
    expect(await prisma.schoolPeriod.findUnique({ where: { id: period.id } })).toBeNull();
  });

  it("refuses a shape that does not exist", async () => {
    await expect(deleteDayShape(-1)).rejects.toThrow(DayShapeError);
  });
});

describe.skipIf(!process.env.DB_TESTS)("listDayShapes", () => {
  it("includes the default shape and the weekdays each shape covers", async () => {
    const shapes = await listDayShapes();
    const defaultShape = shapes.find((s) => s.isDefault);
    expect(defaultShape).toBeDefined();
    // Every weekday this suite has not explicitly assigned still falls back
    // to the default, and this suite never touches a real working day.
    expect(defaultShape!.weekdays).toEqual(
      expect.arrayContaining([0, 1, 2, 3, 4, 5]),
    );
  });

  it("reflects an explicit weekday assignment", async () => {
    const stamp = Date.now();
    const shape = await createDayShape(`__dayshapes listed ${stamp}`);
    made.dayShapeIds.push(shape.id);
    await assignWeekday(TEST_DAY, shape.id);

    const shapes = await listDayShapes();
    const found = shapes.find((s) => s.id === shape.id);
    expect(found?.weekdays).toEqual([TEST_DAY]);

    const defaultShape = shapes.find((s) => s.isDefault);
    expect(defaultShape?.weekdays).not.toContain(TEST_DAY);
  });
});
