import { describe, expect, it } from "vitest";
import {
  ACTIVITY_POINTS,
  DEFAULT_WEIGHTS,
  activityScore,
  conductScore,
  examScore,
  ordinal,
  overallScore,
  validateWeights,
} from "./score";

describe("examScore", () => {
  it("averages the complete terms and ignores incomplete ones", () => {
    expect(examScore([80, null, 60])).toBe(70);
  });
  it("is null with nothing complete", () => {
    expect(examScore([])).toBeNull();
    expect(examScore([null, null])).toBeNull();
  });
});

describe("conductScore", () => {
  it("starts at the base with no entries", () => {
    expect(conductScore(0, 0)).toBe(80);
  });
  it("adds merits and subtracts demerits", () => {
    expect(conductScore(10, 5)).toBe(85);
  });
  it("clamps to 0..100", () => {
    expect(conductScore(50, 0)).toBe(100);
    expect(conductScore(0, 200)).toBe(0);
  });
});

describe("activityScore", () => {
  it("sums points and caps at 100", () => {
    expect(activityScore(30)).toBe(30);
    expect(activityScore(130)).toBe(100);
  });
  it("has a default for each level", () => {
    expect(ACTIVITY_POINTS.PARTICIPATED).toBe(10);
    expect(ACTIVITY_POINTS.PLACED).toBe(20);
    expect(ACTIVITY_POINTS.WON).toBe(30);
  });
});

describe("overallScore", () => {
  it("weights the four pillars", () => {
    const score = overallScore(
      { exams: 80, attendance: 90, conduct: 80, activities: 20 },
      DEFAULT_WEIGHTS,
    );
    // 50*80 + 20*90 + 15*80 + 15*20 = 4000 + 1800 + 1200 + 300 = 7300 / 100
    expect(score).toBe(73);
  });
  it("is null without an exam result", () => {
    expect(
      overallScore({ exams: null, attendance: 90, conduct: 80, activities: 20 }, DEFAULT_WEIGHTS),
    ).toBeNull();
  });
  it("drops the attendance weight when attendance is null", () => {
    const score = overallScore(
      { exams: 80, attendance: null, conduct: 80, activities: 20 },
      DEFAULT_WEIGHTS,
    );
    // (50*80 + 15*80 + 15*20) / 80 = (4000 + 1200 + 300) / 80 = 68.75 → 68.8
    expect(score).toBe(68.8);
  });
  it("rounds to one decimal place", () => {
    const score = overallScore(
      { exams: 33.333, attendance: 66.666, conduct: 80, activities: 0 },
      DEFAULT_WEIGHTS,
    );
    expect(score).toBe(42);
  });
  it("is null when every present weight is zero", () => {
    expect(
      overallScore(
        { exams: 80, attendance: null, conduct: 80, activities: 20 },
        { exams: 0, attendance: 100, conduct: 0, activities: 0 },
      ),
    ).toBeNull();
  });
});

describe("validateWeights", () => {
  it("accepts a set that sums to 100", () => {
    expect(validateWeights(DEFAULT_WEIGHTS)).toBeNull();
    expect(validateWeights({ exams: 100, attendance: 0, conduct: 0, activities: 0 })).toBeNull();
  });
  it("names the sum when it is not 100", () => {
    expect(validateWeights({ exams: 50, attendance: 20, conduct: 15, activities: 10 })).toMatch(
      /currently 95/,
    );
  });
  it("rejects negatives and fractions", () => {
    expect(validateWeights({ exams: 110, attendance: -10, conduct: 0, activities: 0 })).not.toBeNull();
    expect(validateWeights({ exams: 50.5, attendance: 19.5, conduct: 15, activities: 15 })).not.toBeNull();
  });
});

describe("ordinal", () => {
  it("suffixes positions", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(103)).toBe("103rd");
  });
});
