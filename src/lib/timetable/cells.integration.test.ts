import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { setSubjectTeacher } from "@/lib/registry/assignments";
import { createStaff } from "@/lib/registry/staff";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import {
  TimetableCellError,
  TimetableClashError,
  clearTimetable,
  setTimetableCell,
} from "./cells";
import { getSectionGrid } from "./grid";

// Two sections of one grade, two subjects, two teachers, and a two-period day.
// Enough to exercise every rule in setTimetableCell without a seeded school.

const made = {
  yearId: 0,
  gradeId: 0,
  gradeName: "",
  otherGradeId: 0,
  sectionIds: [] as number[],
  staffIds: [] as number[],
  subjectIds: [] as number[],
  offeringIds: [] as number[],
  otherOfferingId: 0,
  bellIds: [] as number[],
};

/// Sunday and Monday are working days under the default week; Saturday is not.
const SUNDAY = 0;
const SATURDAY = 6;

beforeAll(async () => {
  const stamp = Date.now() % 100000;
  // 2000-2049 here, 2050-2099 in teacher-week: nameBS is unique, and the two
  // suites share a database.
  made.yearId = (await createAcademicYear({ nameBS: String(2000 + (stamp % 50)) })).id;

  made.gradeName = `__cells Class ${stamp}`;
  made.gradeId = (
    await createGrade({ name: made.gradeName, order: 910000 + stamp })
  ).id;
  made.otherGradeId = (
    await createGrade({ name: `__cells Other ${stamp}`, order: 920000 + stamp })
  ).id;

  for (const name of ["A", "B"]) {
    made.sectionIds.push(
      (
        await createSection({
          name,
          gradeId: made.gradeId,
          academicYearId: made.yearId,
        })
      ).id,
    );
  }

  const staffBase = {
    designation: "Teacher",
    joinedOn: new Date(Date.UTC(2020, 3, 14)),
  };
  for (const [i, lastName] of ["Sharma", "Thapa"].entries()) {
    made.staffIds.push(
      (
        await createStaff({
          ...staffBase,
          firstName: "__cells",
          lastName,
          phone: `9${i}${String(stamp).padStart(8, "0")}`,
        })
      ).id,
    );
  }

  for (const name of ["Maths", "Science"]) {
    const subjectId = (await createSubject({ name: `__cells ${name} ${stamp}` })).id;
    made.subjectIds.push(subjectId);
    made.offeringIds.push(
      (
        await createOffering({
          subjectId,
          gradeId: made.gradeId,
          academicYearId: made.yearId,
          hasPractical: false,
          fullMarksTheory: 100,
          passMarksTheory: 40,
        })
      ).id,
    );
  }

  // An offering belonging to a different grade entirely — the mismatch case.
  made.otherOfferingId = (
    await createOffering({
      subjectId: made.subjectIds[0],
      gradeId: made.otherGradeId,
      academicYearId: made.yearId,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    })
  ).id;

  // Written directly rather than through saveBellSchedule, so the test does not
  // replace whatever schedule the developer's database already holds. Attached
  // to the default shape — SchoolPeriod now belongs to a DayShape (see
  // day-shapes.ts) rather than to the school outright.
  const defaultShape = await prisma.dayShape.findFirstOrThrow({ where: { isDefault: true } });
  for (const row of [
    { order: 900, name: `__cells P1 ${stamp}`, startMinute: 600, endMinute: 645, kind: "TEACHING" as const },
    { order: 901, name: `__cells P2 ${stamp}`, startMinute: 645, endMinute: 690, kind: "TEACHING" as const },
    { order: 902, name: `__cells Tiffin ${stamp}`, startMinute: 690, endMinute: 720, kind: "BREAK" as const },
  ]) {
    made.bellIds.push(
      (await prisma.schoolPeriod.create({ data: { ...row, dayShapeId: defaultShape.id } })).id,
    );
  }

  // 5A: Maths -> Sharma, Science -> Thapa. 5B: Maths -> Sharma, so the two
  // sections compete for one teacher and a clash is reachable.
  await setSubjectTeacher(made.sectionIds[0], made.offeringIds[0], made.staffIds[0]);
  await setSubjectTeacher(made.sectionIds[0], made.offeringIds[1], made.staffIds[1]);
  await setSubjectTeacher(made.sectionIds[1], made.offeringIds[0], made.staffIds[0]);
});

beforeEach(async () => {
  await prisma.timetablePeriod.deleteMany({
    where: { schoolPeriodId: { in: made.bellIds } },
  });
});

afterAll(async () => {
  await prisma.timetablePeriod.deleteMany({
    where: { schoolPeriodId: { in: made.bellIds } },
  });
  await prisma.schoolPeriod.deleteMany({ where: { id: { in: made.bellIds } } });
  await prisma.teacherAssignment.deleteMany({
    where: { sectionId: { in: made.sectionIds } },
  });
  await prisma.section.deleteMany({ where: { id: { in: made.sectionIds } } });
  await prisma.subjectOffering.deleteMany({
    where: { id: { in: [...made.offeringIds, made.otherOfferingId] } },
  });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjectIds } } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staffIds } } });
  await prisma.grade.deleteMany({
    where: { id: { in: [made.gradeId, made.otherGradeId] } },
  });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

const cell = (over: Partial<Parameters<typeof setTimetableCell>[0]> = {}) => ({
  sectionId: made.sectionIds[0],
  schoolPeriodId: made.bellIds[0],
  dayOfWeek: SUNDAY,
  subjectOfferingId: made.offeringIds[0],
  ...over,
});

describe.skipIf(!process.env.DB_TESTS)("setTimetableCell", () => {
  it("places a lesson and resolves its teacher from the assignment", async () => {
    await setTimetableCell(cell({ room: "Room 101" }));

    const grid = await getSectionGrid(made.sectionIds[0]);
    expect(grid?.cells).toHaveLength(1);
    expect(grid?.cells[0]).toMatchObject({
      dayOfWeek: SUNDAY,
      schoolPeriodId: made.bellIds[0],
      subjectOfferingId: made.offeringIds[0],
      staffId: made.staffIds[0],
      room: "Room 101",
    });
  });

  it("defaults the room to blank rather than demanding one", async () => {
    await setTimetableCell(cell());
    const grid = await getSectionGrid(made.sectionIds[0]);
    expect(grid?.cells[0].room).toBe("");
  });

  it("replaces what is already in the slot instead of stacking a second lesson", async () => {
    await setTimetableCell(cell());
    await setTimetableCell(cell({ subjectOfferingId: made.offeringIds[1] }));

    const grid = await getSectionGrid(made.sectionIds[0]);
    expect(grid?.cells).toHaveLength(1);
    // The replacement hangs off a different assignment, which is exactly why
    // the delete is keyed on the section and not on the assignment.
    expect(grid?.cells[0]).toMatchObject({
      subjectOfferingId: made.offeringIds[1],
      staffId: made.staffIds[1],
    });
  });

  it("clears the slot when the offering is null", async () => {
    await setTimetableCell(cell());
    await setTimetableCell(cell({ subjectOfferingId: null }));

    const grid = await getSectionGrid(made.sectionIds[0]);
    expect(grid?.cells).toEqual([]);
  });

  it("clearing an empty slot is not an error", async () => {
    await expect(
      setTimetableCell(cell({ subjectOfferingId: null })),
    ).resolves.toBeUndefined();
  });

  it("refuses to schedule a lesson in a break", async () => {
    await expect(
      setTimetableCell(cell({ schoolPeriodId: made.bellIds[2] })),
    ).rejects.toThrow(/break/i);
  });

  it("refuses a day the school does not run", async () => {
    await expect(
      setTimetableCell(cell({ dayOfWeek: SATURDAY })),
    ).rejects.toThrow(TimetableCellError);
  });

  it("refuses a subject this section's grade is not taught", async () => {
    await expect(
      setTimetableCell(cell({ subjectOfferingId: made.otherOfferingId })),
    ).rejects.toThrow(/not taught/i);
  });

  it("refuses a subject with no teacher assigned, and says where to fix it", async () => {
    // 5B has Maths but not Science.
    await expect(
      setTimetableCell(
        cell({ sectionId: made.sectionIds[1], subjectOfferingId: made.offeringIds[1] }),
      ),
    ).rejects.toThrow(/Teaching page/i);
  });

  it("refuses to double-book a teacher, naming the class they are already in", async () => {
    await setTimetableCell(cell());

    // Same teacher, same slot, other section.
    const clash = setTimetableCell(cell({ sectionId: made.sectionIds[1] }));
    await expect(clash).rejects.toThrow(TimetableClashError);
    await expect(clash).rejects.toThrow(new RegExp(`${made.gradeName} A`));
  });

  it("lets the same teacher take the same slot on a different day", async () => {
    await setTimetableCell(cell());
    await expect(
      setTimetableCell(cell({ sectionId: made.sectionIds[1], dayOfWeek: 1 })),
    ).resolves.toBeUndefined();
  });

  it("re-saving the same cell is not a clash with itself", async () => {
    await setTimetableCell(cell({ room: "Room 101" }));
    await expect(
      setTimetableCell(cell({ room: "Lab 2" })),
    ).resolves.toBeUndefined();

    const grid = await getSectionGrid(made.sectionIds[0]);
    expect(grid?.cells[0].room).toBe("Lab 2");
  });
});

describe.skipIf(!process.env.DB_TESTS)("getSectionGrid", () => {
  it("offers every subject the grade is taught, with its teacher", async () => {
    const grid = await getSectionGrid(made.sectionIds[0]);
    expect(grid?.options.map((o) => o.subjectOfferingId).sort()).toEqual(
      [...made.offeringIds].sort(),
    );
    expect(grid?.options.every((o) => o.staffId !== null)).toBe(true);
  });

  it("surfaces an unassigned subject as selectable-but-teacherless", async () => {
    // 5B has no Science teacher, so the option exists with a null staff.
    const grid = await getSectionGrid(made.sectionIds[1]);
    const science = grid?.options.find(
      (o) => o.subjectOfferingId === made.offeringIds[1],
    );
    expect(science).toBeDefined();
    expect(science?.staffId).toBeNull();
  });

  it("returns null for a section that does not exist", async () => {
    await expect(getSectionGrid(-1)).resolves.toBeNull();
  });

  it("resolves every weekday to the periods of the shape it runs", async () => {
    // No WeekdayShape row exists for this suite's days, so every one of them
    // falls back to the default shape — the same one made.bellIds sits on,
    // alongside whatever real periods the school already has there.
    const grid = await getSectionGrid(made.sectionIds[0]);
    for (let day = 0; day <= 6; day++) {
      const ids = (grid?.periodsByDay.get(day) ?? []).map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining(made.bellIds));
    }
  });
});

describe.skipIf(!process.env.DB_TESTS)("clearTimetable", () => {
  // A second year, grade, section and bell period, entirely outside `made`,
  // so the year-scoped case has something real to prove it did not reach.
  const other = {
    yearId: 0,
    gradeId: 0,
    sectionId: 0,
    staffId: 0,
    subjectId: 0,
    offeringId: 0,
    bellId: 0,
  };

  beforeAll(async () => {
    const stamp = Date.now() % 100000;
    other.yearId = (
      await createAcademicYear({ nameBS: String(2000 + (stamp % 100)) })
    ).id;
    other.gradeId = (
      await createGrade({ name: `__clear Other ${stamp}`, order: 990000 + stamp })
    ).id;
    other.sectionId = (
      await createSection({ name: "A", gradeId: other.gradeId, academicYearId: other.yearId })
    ).id;
    other.staffId = (
      await createStaff({
        designation: "Teacher",
        joinedOn: new Date(Date.UTC(2020, 3, 14)),
        firstName: "__clear",
        lastName: "Outside",
        phone: `6${String(stamp).padStart(9, "0")}`,
      })
    ).id;
    other.subjectId = (await createSubject({ name: `__clear Subject ${stamp}` })).id;
    other.offeringId = (
      await createOffering({
        subjectId: other.subjectId,
        gradeId: other.gradeId,
        academicYearId: other.yearId,
        hasPractical: false,
        fullMarksTheory: 100,
        passMarksTheory: 40,
      })
    ).id;
    const defaultShape = await prisma.dayShape.findFirstOrThrow({ where: { isDefault: true } });
    other.bellId = (
      await prisma.schoolPeriod.create({
        data: {
          order: 995,
          name: `__clear P1 ${stamp}`,
          startMinute: 600,
          endMinute: 645,
          kind: "TEACHING",
          dayShapeId: defaultShape.id,
        },
      })
    ).id;
    await setSubjectTeacher(other.sectionId, other.offeringId, other.staffId);
  });

  afterAll(async () => {
    await prisma.timetablePeriod.deleteMany({ where: { schoolPeriodId: other.bellId } });
    await prisma.schoolPeriod.deleteMany({ where: { id: other.bellId } });
    await prisma.teacherAssignment.deleteMany({ where: { sectionId: other.sectionId } });
    await prisma.section.deleteMany({ where: { id: other.sectionId } });
    await prisma.subjectOffering.deleteMany({ where: { id: other.offeringId } });
    await prisma.subject.deleteMany({ where: { id: other.subjectId } });
    await prisma.staff.deleteMany({ where: { id: other.staffId } });
    await prisma.grade.deleteMany({ where: { id: other.gradeId } });
    await prisma.academicYear.deleteMany({ where: { id: other.yearId } });
  });

  it("deletes only the named section's lessons, leaving the other section in the same year untouched", async () => {
    await setTimetableCell(cell({ sectionId: made.sectionIds[0] }));
    // A different day: 5A and 5B share a Maths teacher (Sharma), so the same
    // slot for both would be a clash rather than the two lessons this needs.
    await setTimetableCell(cell({ sectionId: made.sectionIds[1], dayOfWeek: 1 }));

    const result = await clearTimetable({ sectionId: made.sectionIds[0] });
    expect(result.deleted).toBe(1);

    expect((await getSectionGrid(made.sectionIds[0]))?.cells).toEqual([]);
    expect((await getSectionGrid(made.sectionIds[1]))?.cells).toHaveLength(1);
  });

  it("clearing a section with nothing booked deletes nothing", async () => {
    const result = await clearTimetable({ sectionId: made.sectionIds[0] });
    expect(result.deleted).toBe(0);
  });

  it("deletes every section's lessons in the named year, and none from another year", async () => {
    await setTimetableCell(cell({ sectionId: made.sectionIds[0] }));
    await setTimetableCell(cell({ sectionId: made.sectionIds[1], dayOfWeek: 1 }));
    await setTimetableCell({
      sectionId: other.sectionId,
      schoolPeriodId: other.bellId,
      dayOfWeek: SUNDAY,
      subjectOfferingId: other.offeringId,
    });

    const result = await clearTimetable({ academicYearId: made.yearId });
    expect(result.deleted).toBe(2);

    expect((await getSectionGrid(made.sectionIds[0]))?.cells).toEqual([]);
    expect((await getSectionGrid(made.sectionIds[1]))?.cells).toEqual([]);
    expect((await getSectionGrid(other.sectionId))?.cells).toHaveLength(1);

    // The untouched lesson is this test's own; clean it up so it cannot leak
    // into a rerun of this suite against the same database.
    await clearTimetable({ sectionId: other.sectionId });
  });
});
