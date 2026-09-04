import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { setSubjectTeacher } from "@/lib/registry/assignments";
import { createStaff } from "@/lib/registry/staff";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import { setTimetableCell } from "@/lib/timetable/cells";
import { getTeacherScheduleForToday } from "./teacher-schedule";

const made = {
  yearId: 0,
  gradeId: 0,
  gradeName: "",
  sectionIds: [] as number[],
  staffIds: [] as number[],
  subjectId: 0,
  offeringId: 0,
  assignmentIds: [] as number[],
  bellIds: [] as number[],
};

const teacher = (staffId: number | null): Actor => ({
  userId: -1,
  username: "__today_schedule",
  role: "TEACHER",
  staffId,
});

beforeAll(async () => {
  const stamp = Date.now() % 100000;
  made.yearId = (
    await createAcademicYear({ nameBS: "2094" })
  ).id;
  made.gradeName = `__schedule Class ${stamp}`;
  made.gradeId = (
    await createGrade({ name: made.gradeName, order: 900000 + stamp })
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
  made.staffIds.push(
    (
      await createStaff({
        ...staffBase,
        firstName: "__schedule",
        lastName: "Mine",
        phone: `98${String(stamp).padStart(8, "0")}`,
      })
    ).id,
    (
      await createStaff({
        ...staffBase,
        firstName: "__schedule",
        lastName: "Other",
        phone: `97${String(stamp).padStart(8, "0")}`,
      })
    ).id,
  );

  made.subjectId = (
    await createSubject({ name: `__schedule Mathematics ${stamp}` })
  ).id;
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
    (
      await setSubjectTeacher(
        made.sectionIds[0],
        made.offeringId,
        made.staffIds[0],
      )
    )!.id,
    (
      await setSubjectTeacher(
        made.sectionIds[1],
        made.offeringId,
        made.staffIds[1],
      )
    )!.id,
  );

  // Three bell slots, written directly so the suite does not replace whatever
  // schedule the developer's database already holds. Attached to the default
  // shape — SchoolPeriod now belongs to a DayShape (see day-shapes.ts) rather
  // than to the school outright.
  const defaultShape = await prisma.dayShape.findFirstOrThrow({ where: { isDefault: true } });
  for (const row of [
    { order: 960, name: `__schedule Early ${stamp}`, startMinute: 8 * 60, endMinute: 8 * 60 + 45 },
    { order: 961, name: `__schedule P1 ${stamp}`, startMinute: 9 * 60, endMinute: 10 * 60 },
    { order: 962, name: `__schedule P2 ${stamp}`, startMinute: 10 * 60 + 30, endMinute: 11 * 60 + 15 },
  ]) {
    made.bellIds.push(
      (await prisma.schoolPeriod.create({ data: { ...row, dayShapeId: defaultShape.id } })).id,
    );
  }

  // Placed through the real write path rather than a raw createMany, so this
  // suite exercises the rules every other caller goes through.
  const [early, p1, p2] = made.bellIds;
  await setTimetableCell({ sectionId: made.sectionIds[0], schoolPeriodId: p1, dayOfWeek: 0, subjectOfferingId: made.offeringId, room: "Room 101" });
  await setTimetableCell({ sectionId: made.sectionIds[0], schoolPeriodId: p2, dayOfWeek: 0, subjectOfferingId: made.offeringId, room: "Lab 2" });
  await setTimetableCell({ sectionId: made.sectionIds[0], schoolPeriodId: early, dayOfWeek: 1, subjectOfferingId: made.offeringId, room: "Room 101" });
  await setTimetableCell({ sectionId: made.sectionIds[1], schoolPeriodId: early, dayOfWeek: 0, subjectOfferingId: made.offeringId, room: "Room 202" });
});

afterAll(async () => {
  await prisma.timetablePeriod.deleteMany({
    where: { schoolPeriodId: { in: made.bellIds } },
  });
  await prisma.schoolPeriod.deleteMany({ where: { id: { in: made.bellIds } } });
  await prisma.teacherAssignment.deleteMany({
    where: { id: { in: made.assignmentIds } },
  });
  await prisma.section.deleteMany({ where: { id: { in: made.sectionIds } } });
  await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staffIds } } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("teacher schedule scoping", () => {
  it("returns only the authenticated teacher's periods for today in time order", async () => {
    const periods = await getTeacherScheduleForToday(
      teacher(made.staffIds[0]),
      made.yearId,
      new Date("2026-08-30T04:00:00.000Z"),
    );

    expect(periods.map((period) => period.startMinute)).toEqual([
      9 * 60,
      10 * 60 + 30,
    ]);
    expect(periods.map((period) => period.room)).toEqual(["Room 101", "Lab 2"]);
    expect(periods.map((period) => period.classSection)).toEqual([
      `${made.gradeName} A`,
      `${made.gradeName} A`,
    ]);
    expect(periods.map((period) => period.isCurrent)).toEqual([true, false]);
  });

  it("returns no schedule for an unlinked teacher or a non-teacher", async () => {
    await expect(
      getTeacherScheduleForToday(
        teacher(null),
        made.yearId,
        new Date("2026-08-30T04:00:00.000Z"),
      ),
    ).resolves.toEqual([]);
    await expect(
      getTeacherScheduleForToday(
        { ...teacher(made.staffIds[0]), role: "OFFICE" },
        made.yearId,
        new Date("2026-08-30T04:00:00.000Z"),
      ),
    ).resolves.toEqual([]);
  });
});
