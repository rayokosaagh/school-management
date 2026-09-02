import { describe, expect, it } from "vitest";
import { BellScheduleError, DEFAULT_BELL, validateBell } from "./schedule";

// A bell schedule is the spine of the whole timetable: every lesson points at
// one of its rows. These rules run before anything is written, so a school
// cannot end up with two Period 3s or a period that ends before it starts.

const p = (
  order: number,
  name: string,
  startMinute: number,
  endMinute: number,
  isBreak = false,
) => ({ order, name, startMinute, endMinute, isBreak });

describe("validateBell", () => {
  it("accepts a plain three-period morning", () => {
    expect(() =>
      validateBell([
        p(0, "Period 1", 600, 645),
        p(1, "Period 2", 645, 690),
        p(2, "Period 3", 690, 735),
      ]),
    ).not.toThrow();
  });

  it("accepts the built-in default", () => {
    expect(() => validateBell(DEFAULT_BELL)).not.toThrow();
  });

  it("rejects an empty schedule", () => {
    expect(() => validateBell([])).toThrow(BellScheduleError);
  });

  it("rejects a period that ends before it starts", () => {
    expect(() => validateBell([p(0, "Period 1", 645, 600)])).toThrow(
      /ends before it starts/i,
    );
  });

  it("rejects a period of no length", () => {
    expect(() => validateBell([p(0, "Period 1", 600, 600)])).toThrow(
      BellScheduleError,
    );
  });

  it("rejects times outside the day", () => {
    expect(() => validateBell([p(0, "Period 1", -30, 600)])).toThrow(
      BellScheduleError,
    );
    expect(() => validateBell([p(0, "Period 1", 1400, 1500)])).toThrow(
      BellScheduleError,
    );
  });

  it("rejects two periods that overlap", () => {
    expect(() =>
      validateBell([p(0, "Period 1", 600, 660), p(1, "Period 2", 630, 690)]),
    ).toThrow(/overlaps/i);
  });

  it("allows periods that touch end to start", () => {
    expect(() =>
      validateBell([p(0, "Period 1", 600, 645), p(1, "Period 2", 645, 690)]),
    ).not.toThrow();
  });

  it("rejects a gap in the numbering", () => {
    expect(() =>
      validateBell([p(0, "Period 1", 600, 645), p(2, "Period 2", 645, 690)]),
    ).toThrow(/numbered/i);
  });

  it("rejects numbering that does not start at zero", () => {
    expect(() => validateBell([p(1, "Period 1", 600, 645)])).toThrow(
      BellScheduleError,
    );
  });

  it("rejects a blank name", () => {
    expect(() => validateBell([p(0, "   ", 600, 645)])).toThrow(/name/i);
  });

  it("rejects two periods sharing a name", () => {
    // Trimmed and case-folded: "Period 1" and "period 1 " are the same slot to
    // anyone reading a printed timetable.
    expect(() =>
      validateBell([p(0, "Period 1", 600, 645), p(1, "period 1 ", 645, 690)]),
    ).toThrow(/same name/i);
  });

  it("rejects a schedule with no teaching period", () => {
    expect(() => validateBell([p(0, "Tiffin", 600, 645, true)])).toThrow(
      /at least one/i,
    );
  });
});

describe("DEFAULT_BELL", () => {
  it("is a seven-period day around one break", () => {
    expect(DEFAULT_BELL.filter((row) => !row.isBreak)).toHaveLength(7);
    expect(DEFAULT_BELL.filter((row) => row.isBreak)).toHaveLength(1);
  });

  it("is numbered from zero without gaps", () => {
    expect(DEFAULT_BELL.map((row) => row.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});
