import { describe, expect, it } from "vitest";
import { attendancePercent, lastDays, stripFromCalendar } from "./strip";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("stripFromCalendar", () => {
  it("maps each requested day to the record's status, oldest first, 'none' when there is no record", () => {
    const days = [d("2083-05-10"), d("2083-05-11"), d("2083-05-12"), d("2083-05-13")];
    const records = [
      { date: d("2083-05-10"), status: "PRESENT" },
      { date: d("2083-05-12"), status: "LATE" },
      { date: d("2083-05-13"), status: "ABSENT" },
    ];
    expect(stripFromCalendar(records, days)).toEqual(["present", "none", "late", "absent"]);
  });
  it("treats LEAVE as absent for the strip and ignores records outside the window", () => {
    const days = [d("2083-05-10")];
    expect(stripFromCalendar([{ date: d("2083-05-10"), status: "LEAVE" }, { date: d("2083-05-09"), status: "PRESENT" }], days)).toEqual(["absent"]);
  });
  it("returns an empty strip for no days", () => {
    expect(stripFromCalendar([], [])).toEqual([]);
  });
});

describe("attendancePercent", () => {
  it("counts present and late as attended, rounded", () => {
    expect(attendancePercent([{ status: "PRESENT" }, { status: "LATE" }, { status: "ABSENT" }])).toBe(67);
  });
  it("is null with no records", () => {
    expect(attendancePercent([])).toBeNull();
  });
});

describe("lastDays", () => {
  it("returns `count` UTC-midnight dates ending on `end`, oldest first", () => {
    const days = lastDays(new Date("2083-05-13T10:30:00.000Z"), 3);
    expect(days.map((x) => x.toISOString())).toEqual([
      "2083-05-11T00:00:00.000Z",
      "2083-05-12T00:00:00.000Z",
      "2083-05-13T00:00:00.000Z",
    ]);
  });
});
