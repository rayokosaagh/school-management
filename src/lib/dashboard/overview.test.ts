import { describe, expect, it } from "vitest";
import { recentDays, summariseTrend } from "./overview";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("recentDays", () => {
  it("ends on the given day and runs oldest first", () => {
    const days = recentDays(utc(2026, 3, 10), 4);
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });

  it("crosses a month boundary", () => {
    const days = recentDays(utc(2026, 3, 2), 3);
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("normalises a timestamp to its UTC midnight", () => {
    const days = recentDays(new Date("2026-03-10T18:45:00Z"), 1);
    expect(days[0].toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });
});

describe("summariseTrend", () => {
  const days = recentDays(utc(2026, 3, 3), 3);

  it("counts present and late as present", () => {
    const rows = [
      { date: utc(2026, 3, 3), status: "PRESENT" },
      { date: utc(2026, 3, 3), status: "LATE" },
      { date: utc(2026, 3, 3), status: "ABSENT" },
    ];
    expect(summariseTrend(rows, days)[2]).toEqual({
      date: utc(2026, 3, 3),
      present: 2,
      marked: 3,
    });
  });

  it("keeps days with nothing marked rather than dropping them", () => {
    const out = summariseTrend([{ date: utc(2026, 3, 3), status: "PRESENT" }], days);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ date: utc(2026, 3, 1), present: 0, marked: 0 });
    expect(out[1]).toEqual({ date: utc(2026, 3, 2), present: 0, marked: 0 });
  });

  it("ignores records outside the window", () => {
    const out = summariseTrend([{ date: utc(2026, 2, 20), status: "PRESENT" }], days);
    expect(out.every((d) => d.marked === 0)).toBe(true);
  });
});
