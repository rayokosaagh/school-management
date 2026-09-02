import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { setSubjectTeacher } from "@/lib/registry/assignments";
import { createStaff } from "@/lib/registry/staff";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import { setTimetableCell } from "./cells";
import { getTeacherWeek, listTeacherClashes } from "./teacher-week";

const made = {
  yearId: 0,
  gradeId: 0,
  gradeName: "",
  sectionIds: [] as number[],
  staffIds: [] as number[],
  subjectId: 0,
  offeringId: 0,
  bellIds: [] as number[],
};

beforeAll(async () => {
  const stamp = Date.now() % 100000;
  made.yearId = (await createAcademicYear({ nameBS: String(2050 + (stamp % 50)) })).id;
  made.gradeName = `__week Class ${stamp}`;
  made.gradeId = (
    await createGrade({ name: made.gradeName, order: 930000 + stamp })
  ).id;

  for (const name of ["A", "B"]) {
    made.sectionIds.push(
      (await createSection({ name, gradeId: made.gradeId, academicYearId: made.yearId })).id,
    );
  }

  const staffBase = { designation: "Teacher", joinedOn: new Date(Date.UTC(2020, 3, 14)) };
  for (const [i, lastName] of ["Busy", "Free"].entries()) {
    made.staffIds.push(
      (
        await createStaff({
          ...staffBase,
          firstName: "__week",
          lastName,
          phone: `8${i}${String(stamp).padStart(8, "0")}`,
        })
      ).id,
    );
  }

  made.subjectId = (await createSubject({ name: `__week Maths ${stamp}` })).id;
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

  made.bellIds.push(
    (
      await prisma.schoolPeriod.create({
        data: {
          order: 950,
          name: `__week P1 ${stamp}`,
          startMinute: 600,
          endMinute: 645,
          isBreak: false,
        },
      })
    ).id,
  );

  // Each section gets its own teacher, so both can hold the same slot.
  await setSubjectTeacher(made.sectionIds[0], made.offeringId, made.staffIds[0]);
  await setSubjectTeacher(made.sectionIds[1], made.offeringId, made.staffIds[1]);

  await setTimetableCell({
    sectionId: made.sectionIds[0],
    schoolPeriodId: made.bellIds[0],
    dayOfWeek: 0,
    subjectOfferingId: made.offeringId,
    room: "Room 1",
  });
  await setTimetableCell({
    sectionId: made.sectionIds[1],
    schoolPeriodId: made.bellIds[0],
    dayOfWeek: 0,
    subjectOfferingId: made.offeringId,
    room: "Room 2",
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
  await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staffIds } } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("getTeacherWeek", () => {
  it("returns one teacher's lessons with the bell slot's times", async () => {
    const week = await getTeacherWeek(made.staffIds[0], made.yearId);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({
      dayOfWeek: 0,
      startMinute: 600,
      endMinute: 645,
      classSection: `${made.gradeName} A`,
      room: "Room 1",
    });
  });

  it("is empty for a teacher with nothing scheduled", async () => {
    await expect(getTeacherWeek(-1, made.yearId)).resolves.toEqual([]);
  });
});

describe.skipIf(!process.env.DB_TESTS)("listTeacherClashes", () => {
  it("finds nothing while every teacher is in one place", async () => {
    const clashes = await listTeacherClashes(made.yearId);
    expect(clashes).toEqual([]);
  });

  it("catches the double-booking a Teaching-page reassignment creates", async () => {
    // The path setTimetableCell cannot produce: 5B's Maths moves to the teacher
    // who is already taking 5A in that slot, so both lessons now point at them.
    await setSubjectTeacher(made.sectionIds[1], made.offeringId, made.staffIds[0]);

    const clashes = await listTeacherClashes(made.yearId);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].staffId).toBe(made.staffIds[0]);
    expect(clashes[0].sections.map((s) => s.label).sort()).toEqual([
      `${made.gradeName} A`,
      `${made.gradeName} B`,
    ]);

    // Put it back so the suite can be re-run against the same database.
    await setSubjectTeacher(made.sectionIds[1], made.offeringId, made.staffIds[1]);
  });
});
