import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAcademicYear, listAcademicYearsWithSize } from "./academic-year";
import { createGrade, createSection } from "./structure";

// Talks to the real database. Everything it makes is torn down afterwards, and
// it touches nothing it did not create.
const made = { emptyYearId: 0, filledYearId: 0, gradeId: 0, sectionId: 0 };

const EMPTY_YEAR = "2097";
const FILLED_YEAR = "2098";
const GRADE = "__size Class 5";

afterAll(async () => {
  if (made.sectionId) await prisma.section.delete({ where: { id: made.sectionId } });
  if (made.gradeId) await prisma.grade.delete({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({
    where: { nameBS: { in: [EMPTY_YEAR, FILLED_YEAR] } },
  });
});

describe.skipIf(!process.env.DB_TESTS)("listAcademicYearsWithSize", () => {
  it("reports zero sections for a year nothing has been set up in", async () => {
    // The switcher labels such a year "not set up"; switching into one blanks
    // every page, so the count has to stay truthful.
    made.emptyYearId = (await createAcademicYear({ nameBS: EMPTY_YEAR })).id;
    made.filledYearId = (await createAcademicYear({ nameBS: FILLED_YEAR })).id;
    made.gradeId = (await createGrade({ name: GRADE, order: 9985 })).id;
    made.sectionId = (
      await createSection({
        gradeId: made.gradeId,
        academicYearId: made.filledYearId,
        name: "A",
      })
    ).id;

    const years = await listAcademicYearsWithSize();
    const empty = years.find((y) => y.id === made.emptyYearId);
    const filled = years.find((y) => y.id === made.filledYearId);

    expect(empty?.sections).toBe(0);
    expect(empty?.enrollments).toBe(0);
    expect(filled?.sections).toBe(1);
  });
});
