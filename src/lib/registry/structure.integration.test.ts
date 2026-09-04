import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createGrade, reorderGrades } from "./structure";

// Talks to the real database, which holds the developer's actual school (12
// grades, 127 students, 1,959 marks). Everything this file writes is a
// `__reorder`-prefixed fixture grade, torn down in afterAll. The fixtures are
// placed at the *tail* of the order list — after every real grade, in the
// real grades' own untouched relative sequence — so the real grades' order
// values never change (reorderGrades needs the complete list, not just the
// fixtures, but this keeps them a no-op) and deleting the fixtures afterward
// leaves no gap for the real grades to fall into.
const made = {
  gradeIds: [] as number[],
};

const NAMES = ["__reorder A", "__reorder B", "__reorder C"];

afterAll(async () => {
  if (made.gradeIds.length > 0) {
    await prisma.grade.deleteMany({ where: { id: { in: made.gradeIds } } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("reorderGrades", () => {
  it("reverses three fixture grades without touching the real ones", async () => {
    // Captured before the fixtures exist: exactly the real school's grades,
    // in their current relative order. reorderGrades requires every existing
    // grade in the list, so these ride along unchanged at the front.
    const realGradesBefore = await prisma.grade.findMany({
      orderBy: { order: "asc" },
    });
    const realIds = realGradesBefore.map((g) => g.id);
    const totalBefore = realIds.length;

    // Created above every existing order, per the live-data warning, so this
    // can never collide with a real grade's order.
    const highest = await prisma.grade.aggregate({ _max: { order: true } });
    let nextOrder = (highest._max.order ?? -1) + 1;

    const a = await createGrade({ name: NAMES[0], order: nextOrder++ });
    made.gradeIds.push(a.id);
    const b = await createGrade({ name: NAMES[1], order: nextOrder++ });
    made.gradeIds.push(b.id);
    const c = await createGrade({ name: NAMES[2], order: nextOrder++ });
    made.gradeIds.push(c.id);

    // The complete list reorderGrades requires: every real grade first, in
    // its untouched relative order, then the three fixtures reversed (C, B, A).
    const count = await reorderGrades([...realIds, c.id, b.id, a.id]);
    expect(count).toBe(totalBefore + 3);

    const [freshA, freshB, freshC] = await Promise.all([
      prisma.grade.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.grade.findUniqueOrThrow({ where: { id: b.id } }),
      prisma.grade.findUniqueOrThrow({ where: { id: c.id } }),
    ]);
    // Relative to the real grades ahead of them, the fixtures now read
    // 0, 1, 2 in their reversed (C, B, A) sequence.
    expect(freshC.order - totalBefore).toBe(0);
    expect(freshB.order - totalBefore).toBe(1);
    expect(freshA.order - totalBefore).toBe(2);

    // Every id handed in is still a real row afterwards — the parking dance
    // never silently drops one.
    const stillThere = await prisma.grade.count({
      where: { id: { in: [...realIds, c.id, b.id, a.id] } },
    });
    expect(stillThere).toBe(totalBefore + 3);

    // The real grades kept their exact relative sequence — placed first in
    // the list, they land at positions 0..totalBefore-1 in that same order,
    // whatever their absolute order values happened to be beforehand.
    const realGradesAfter = await prisma.grade.findMany({
      where: { id: { in: realIds } },
      orderBy: { order: "asc" },
    });
    expect(realGradesAfter.map((g) => g.id)).toEqual(realIds);
    expect(realGradesAfter.map((g) => g.order)).toEqual(
      realIds.map((_id, i) => i),
    );
  });
});
