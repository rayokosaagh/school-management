import { describe, expect, it } from "vitest";
import { shortGrade, shortGradeList } from "./grade-label";

describe("shortGrade", () => {
  it("keeps the number from a numbered class", () => {
    expect(shortGrade("Class 1")).toBe("1");
    expect(shortGrade("Class 10")).toBe("10");
    expect(shortGrade("Grade 7")).toBe("7");
  });

  it("uses initials for named grades", () => {
    expect(shortGrade("Kindergarten")).toBe("K");
    expect(shortGrade("Senior Kindergarten")).toBe("SK");
    expect(shortGrade("Lower Kindergarten Blue")).toBe("LKB");
  });

  it("survives odd spacing and an empty name", () => {
    expect(shortGrade("  Class   9  ")).toBe("9");
    expect(shortGrade("")).toBe("");
  });
});

describe("shortGradeList", () => {
  it("keeps the order it was given", () => {
    expect(shortGradeList(["Kindergarten", "Senior Kindergarten", "Class 1"])).toBe(
      "K, SK, 1",
    );
  });

  it("counts the overflow rather than growing", () => {
    const grades = ["Kindergarten", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"];
    expect(shortGradeList(grades, 4)).toBe("K, 1, 2, 3 +3");
  });

  it("says nothing for a subject offered nowhere", () => {
    expect(shortGradeList([])).toBe("");
  });
});
