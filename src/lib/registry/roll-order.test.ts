import { describe, expect, it } from "vitest";
import { isRollOrder, orderForRoll, type RollCandidate } from "./roll-order";

const student = (
  enrollmentId: number,
  fullName: string,
  admissionNo: string,
  total: number | null = null,
): RollCandidate => ({ enrollmentId, fullName, admissionNo, total });

const names = (rows: RollCandidate[]) => rows.map((r) => r.fullName);

describe("orderForRoll · alphabetical", () => {
  it("sorts by name regardless of admission or marks", () => {
    const rows = [
      student(1, "Sita Sharma", "9", 90),
      student(2, "Anita Rai", "3", 10),
      student(3, "Bibek Rai", "1", 50),
    ];
    expect(names(orderForRoll(rows, "ALPHABETICAL"))).toEqual([
      "Anita Rai",
      "Bibek Rai",
      "Sita Sharma",
    ]);
  });

  it("ignores case", () => {
    const rows = [student(1, "bibek rai", "1"), student(2, "Anita Rai", "2")];
    expect(names(orderForRoll(rows, "ALPHABETICAL"))).toEqual(["Anita Rai", "bibek rai"]);
  });

  it("leaves the caller's array untouched", () => {
    const rows = [student(1, "Sita", "2"), student(2, "Anita", "1")];
    orderForRoll(rows, "ALPHABETICAL");
    expect(names(rows)).toEqual(["Sita", "Anita"]);
  });
});

describe("orderForRoll · marks", () => {
  it("ranks the highest total first", () => {
    const rows = [
      student(1, "Anita Rai", "1", 55),
      student(2, "Bibek Rai", "2", 91),
      student(3, "Sita Sharma", "3", 70),
    ];
    expect(names(orderForRoll(rows, "MARKS"))).toEqual([
      "Bibek Rai",
      "Sita Sharma",
      "Anita Rai",
    ]);
  });

  it("breaks a tie on the name, so the same input always gives the same roll", () => {
    const rows = [
      student(1, "Sita Sharma", "1", 70),
      student(2, "Anita Rai", "2", 70),
    ];
    expect(names(orderForRoll(rows, "MARKS"))).toEqual(["Anita Rai", "Sita Sharma"]);
  });

  it("puts a student who sat nothing last, not as a zero", () => {
    const rows = [
      student(1, "Anita Rai", "1", null),
      student(2, "Bibek Rai", "2", 0),
      student(3, "Sita Sharma", "3", 40),
    ];
    expect(names(orderForRoll(rows, "MARKS"))).toEqual([
      "Sita Sharma",
      "Bibek Rai",
      "Anita Rai",
    ]);
  });

  it("orders students who all sat nothing by name", () => {
    const rows = [student(1, "Sita", "1"), student(2, "Anita", "2")];
    expect(names(orderForRoll(rows, "MARKS"))).toEqual(["Anita", "Sita"]);
  });
});

describe("orderForRoll · admission", () => {
  it("compares numeric admission numbers as numbers", () => {
    const rows = [
      student(1, "C", "10"),
      student(2, "A", "9"),
      student(3, "B", "100"),
    ];
    expect(names(orderForRoll(rows, "ADMISSION"))).toEqual(["A", "C", "B"]);
  });

  it("falls back to a natural compare for non-numeric numbers", () => {
    const rows = [student(1, "B", "2083-02"), student(2, "A", "2083-10")];
    expect(names(orderForRoll(rows, "ADMISSION"))).toEqual(["B", "A"]);
  });
});

describe("isRollOrder", () => {
  it("accepts only the three orders", () => {
    expect(isRollOrder("MARKS")).toBe(true);
    expect(isRollOrder("ALPHABETICAL")).toBe(true);
    expect(isRollOrder("ADMISSION")).toBe(true);
    expect(isRollOrder("RANDOM")).toBe(false);
    expect(isRollOrder("")).toBe(false);
  });
});
