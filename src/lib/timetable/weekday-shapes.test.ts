import { describe, expect, it } from "vitest";
import { buildDayColumn, describeClear, describeOrphanedLessons, shapeIdByDay } from "./schedule";

// The pure pieces behind the shape switcher and its confirmations: which
// weekday runs which shape, what a destructive change should say before it
// is allowed through, and how one weekday's own column of periods is built —
// the exact spot the "shorter day" rendering bug lived (a day was padded out
// to match periods it did not have, rather than simply having fewer rows).

describe("shapeIdByDay", () => {
  it("flips shape -> weekdays into weekday -> shape", () => {
    expect(
      shapeIdByDay([
        { id: 1, weekdays: [0, 1, 2, 3, 4] },
        { id: 2, weekdays: [5] },
      ]),
    ).toEqual({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2 });
  });

  it("leaves a day with no shape absent, not defaulted to zero", () => {
    expect(shapeIdByDay([{ id: 1, weekdays: [0] }])[6]).toBeUndefined();
  });

  it("returns an empty map for no shapes", () => {
    expect(shapeIdByDay([])).toEqual({});
  });
});

describe("describeOrphanedLessons", () => {
  it("says nothing will be removed when the count is zero", () => {
    expect(describeOrphanedLessons({ count: 0, sections: [] })).toMatch(/no lessons/i);
  });

  it("names the affected classes, not just a count", () => {
    const text = describeOrphanedLessons({
      count: 3,
      sections: [
        { id: 1, name: "A", gradeName: "Five" },
        { id: 2, name: "B", gradeName: "Five" },
      ],
    });
    expect(text).toContain("3 lesson");
    expect(text).toContain("Five A");
    expect(text).toContain("Five B");
  });

  it("singularises one lesson", () => {
    expect(
      describeOrphanedLessons({ count: 1, sections: [{ id: 1, name: "A", gradeName: "Five" }] }),
    ).toContain("1 lesson ");
  });
});

describe("describeClear", () => {
  it("says nothing is scheduled when the count is zero", () => {
    expect(describeClear(0, "Five A")).toMatch(/no lessons/i);
  });

  it("names the scope and the count otherwise", () => {
    expect(describeClear(12, "Five A")).toContain("12 lessons");
    expect(describeClear(12, "Five A")).toContain("Five A");
  });

  it("singularises one lesson", () => {
    expect(describeClear(1, "Five A")).toContain("1 lesson ");
  });
});

describe("buildDayColumn", () => {
  const periods = [
    { id: 1, name: "P1" },
    { id: 2, name: "P2" },
    { id: 3, name: "P3" },
  ];

  it("pairs each period with the lesson booked into it", () => {
    const cells = [{ schoolPeriodId: 2, subject: "Maths" }];
    const column = buildDayColumn(periods, cells);
    expect(column).toEqual([
      { period: periods[0], cell: null },
      { period: periods[1], cell: cells[0] },
      { period: periods[2], cell: null },
    ]);
  });

  it("never pads with a period the day was not given", () => {
    // A narrower shape (a half day) is simply a shorter `periods` array —
    // there is nothing here that could grow it back out to match a longer day.
    const column = buildDayColumn(periods.slice(0, 1), []);
    expect(column).toHaveLength(1);
  });

  it("ignores a lesson on a period this day does not carry", () => {
    // Shape-scoped ids can still collide by coincidence across two shapes;
    // a cell for a period id absent from `periods` must not surface here.
    const column = buildDayColumn(periods.slice(0, 1), [
      { schoolPeriodId: 99, subject: "Ghost" },
    ]);
    expect(column[0].cell).toBeNull();
  });

  it("returns an empty column for a day with no periods at all", () => {
    expect(buildDayColumn([], [])).toEqual([]);
  });
});
