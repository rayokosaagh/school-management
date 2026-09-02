import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent } from "@/lib/registry/students";
import {
  HonoursError,
  activityEntryStudent,
  addActivity,
  addConduct,
  conductEntryStudent,
  deleteActivity,
  deleteConduct,
  listActivities,
  listConduct,
} from "./entries";

const made = { yearId: 0, gradeId: 0, sectionId: 0, studentId: 0 };
const BS = 2097;

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
  made.gradeId = (await createGrade({ name: "__hon-e Class 4", order: 9981 })).id;
  made.sectionId = (
    await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })
  ).id;
  made.studentId = (
    await createStudent({
      admissionNo: `__hon-e-${Date.now()}`,
      firstName: "__hon",
      lastName: "Entries",
      dob: new Date(Date.UTC(2014, 0, 1)),
      gender: "FEMALE",
      admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
      guardians: [{ relation: "MOTHER", fullName: "__hon Mum", phone: "9800000031" }],
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    })
  ).id;
});

afterAll(async () => {
  await prisma.conductEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.activityEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.enrollment.deleteMany({ where: { studentId: made.studentId } });
  await prisma.guardian.deleteMany({ where: { studentId: made.studentId } });
  await prisma.student.deleteMany({ where: { id: made.studentId } });
  await prisma.section.deleteMany({ where: { id: made.sectionId } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("conduct and activity entries", () => {
  it("records conduct and lists it newest first", async () => {
    const base = { studentId: made.studentId, academicYearId: made.yearId, recordedById: null };
    const older = await addConduct({
      ...base,
      kind: "DEMERIT",
      points: 5,
      date: bsToAd({ year: BS, month: 2, day: 1 }),
      note: "Late twice",
    });
    const newer = await addConduct({
      ...base,
      kind: "MERIT",
      points: 10,
      date: bsToAd({ year: BS, month: 3, day: 1 }),
      note: "Helped in the library",
    });

    const rows = await listConduct(made.studentId, made.yearId);
    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(rows[0]).toMatchObject({
      kind: "MERIT",
      points: 10,
      note: "Helped in the library",
      dateBs: `${BS}-03-01`,
    });
    expect(await conductEntryStudent(older.id)).toBe(made.studentId);

    await deleteConduct(older.id);
    expect(await listConduct(made.studentId, made.yearId)).toHaveLength(1);
    expect(await conductEntryStudent(older.id)).toBeNull();
  });

  it("refuses conduct with no points or no note", async () => {
    const base = {
      studentId: made.studentId,
      academicYearId: made.yearId,
      recordedById: null,
      date: new Date(),
    };
    await expect(addConduct({ ...base, kind: "MERIT", points: 0, note: "x y" })).rejects.toBeInstanceOf(HonoursError);
    await expect(addConduct({ ...base, kind: "MERIT", points: 101, note: "x y" })).rejects.toBeInstanceOf(HonoursError);
    await expect(addConduct({ ...base, kind: "MERIT", points: 5, note: " " })).rejects.toBeInstanceOf(HonoursError);
  });

  it("records activities and lists them newest first", async () => {
    const base = { studentId: made.studentId, academicYearId: made.yearId, recordedById: null };
    const a = await addActivity({
      ...base,
      name: "Science fair",
      level: "PLACED",
      points: 20,
      date: bsToAd({ year: BS, month: 4, day: 5 }),
    });
    const b = await addActivity({
      ...base,
      name: "Football",
      level: "WON",
      points: 30,
      date: bsToAd({ year: BS, month: 5, day: 5 }),
    });

    const rows = await listActivities(made.studentId, made.yearId);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows[1]).toMatchObject({ name: "Science fair", level: "PLACED", points: 20, dateBs: `${BS}-04-05` });
    expect(await activityEntryStudent(a.id)).toBe(made.studentId);

    await deleteActivity(a.id);
    expect(await listActivities(made.studentId, made.yearId)).toHaveLength(1);
  });

  it("refuses an activity without a name or points", async () => {
    const base = {
      studentId: made.studentId,
      academicYearId: made.yearId,
      recordedById: null,
      date: new Date(),
      level: "WON" as const,
    };
    await expect(addActivity({ ...base, name: "", points: 10 })).rejects.toBeInstanceOf(HonoursError);
    await expect(addActivity({ ...base, name: "Quiz", points: 0 })).rejects.toBeInstanceOf(HonoursError);
  });
});
