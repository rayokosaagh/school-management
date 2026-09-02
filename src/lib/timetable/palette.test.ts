import { describe, expect, it } from "vitest";
import { SUBJECT_TONES, periodProgress, toneForRank } from "./schedule";

// The grid colours each subject, so the same subject has to land on the same
// tone everywhere — across sections, across years, and between the server
// render and the browser.

describe("toneForRank", () => {
  it("gives the first eight subjects a colour each", () => {
    const tones = [0, 1, 2, 3, 4, 5, 6, 7].map(toneForRank);
    expect(new Set(tones).size).toBe(SUBJECT_TONES);
  });

  it("only repeats once a school passes eight subjects", () => {
    expect(toneForRank(8)).toBe(toneForRank(0));
    expect(toneForRank(9)).toBe(toneForRank(1));
  });

  it("always lands on a tone globals.css defines", () => {
    for (const rank of [0, 3, 7, 8, 41, 1000]) {
      const tone = toneForRank(rank);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(SUBJECT_TONES);
    }
  });

  it("does not fall off the end of the palette on a negative rank", () => {
    // A subject missing from the ranking would otherwise index --subject--1.
    expect(toneForRank(-1)).toBeGreaterThanOrEqual(0);
    expect(toneForRank(-1)).toBeLessThan(SUBJECT_TONES);
  });
});

describe("periodProgress", () => {
  const period = { startMinute: 600, endMinute: 645 };

  it("runs from zero at the bell to one at the end", () => {
    expect(periodProgress(period, 600)).toBe(0);
    expect(periodProgress(period, 622.5)).toBeCloseTo(0.5);
    expect(periodProgress(period, 645)).toBe(1);
  });

  it("clamps outside the period rather than running off the cell", () => {
    expect(periodProgress(period, 300)).toBe(0);
    expect(periodProgress(period, 900)).toBe(1);
  });

  it("is zero for a period of no length rather than dividing by zero", () => {
    expect(periodProgress({ startMinute: 600, endMinute: 600 }, 600)).toBe(0);
  });
});
