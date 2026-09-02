import { describe, expect, it } from "vitest";
import { formatMinute, periodIsCurrent, schoolTime } from "./teacher-schedule";

describe("schoolTime", () => {
  it("uses the Nepal school clock rather than the server timezone", () => {
    expect(schoolTime(new Date("2026-08-30T04:00:00.000Z"))).toEqual({
      dayOfWeek: 0,
      minuteOfDay: 9 * 60 + 45,
    });
  });
});

describe("periodIsCurrent", () => {
  const period = { startMinute: 9 * 60, endMinute: 9 * 60 + 45 };

  it("includes the start and excludes the end of a period", () => {
    expect(periodIsCurrent(period, 9 * 60)).toBe(true);
    expect(periodIsCurrent(period, 9 * 60 + 44)).toBe(true);
    expect(periodIsCurrent(period, 9 * 60 + 45)).toBe(false);
  });
});

describe("formatMinute", () => {
  it("formats timetable minutes as a compact 24-hour time", () => {
    expect(formatMinute(8 * 60 + 5)).toBe("08:05");
    expect(formatMinute(15 * 60 + 30)).toBe("15:30");
  });
});
