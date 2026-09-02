import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { WeightsError, getWeights, saveWeights } from "./weights";
import { DEFAULT_WEIGHTS } from "./score";

// The profile is a single row shared by everything; remember what was there
// and put it back so a run leaves the school's settings alone.
let before: {
  weightExams: number;
  weightAttendance: number;
  weightConduct: number;
  weightActivities: number;
} | null = null;

beforeAll(async () => {
  before = await prisma.schoolProfile.findUnique({
    where: { id: 1 },
    select: { weightExams: true, weightAttendance: true, weightConduct: true, weightActivities: true },
  });
});

afterAll(async () => {
  if (before) await prisma.schoolProfile.update({ where: { id: 1 }, data: before });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("honours weights", () => {
  it("round-trips a valid set", async () => {
    const profile = await prisma.schoolProfile.findUnique({ where: { id: 1 } });
    if (!profile) {
      // Nothing to write onto; the service refuses rather than inventing a school.
      await expect(
        saveWeights({ exams: 40, attendance: 20, conduct: 20, activities: 20 }),
      ).rejects.toBeInstanceOf(WeightsError);
      expect(await getWeights()).toEqual(DEFAULT_WEIGHTS);
      return;
    }
    await saveWeights({ exams: 40, attendance: 20, conduct: 20, activities: 20 });
    expect(await getWeights()).toEqual({ exams: 40, attendance: 20, conduct: 20, activities: 20 });
  });

  it("refuses a set that does not sum to 100", async () => {
    await expect(
      saveWeights({ exams: 40, attendance: 20, conduct: 20, activities: 10 }),
    ).rejects.toBeInstanceOf(WeightsError);
  });
});
