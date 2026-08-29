import { describe, expect, it } from "vitest";
import { evaluate, gradeFor, rank, summarise, type Scheme } from "./grading";

const THEORY_ONLY: Scheme = {
  fullMarksTheory: 100,
  passMarksTheory: 40,
  hasPractical: false,
  fullMarksPractical: null,
  passMarksPractical: null,
};

const WITH_PRACTICAL: Scheme = {
  fullMarksTheory: 75,
  passMarksTheory: 27,
  hasPractical: true,
  fullMarksPractical: 25,
  passMarksPractical: 10,
};

describe("gradeFor", () => {
  it.each([
    [100, "A+"],
    [90, "A+"],
    [89.9, "A"],
    [80, "A"],
    [70, "B+"],
    [60, "B"],
    [50, "C+"],
    [40, "C"],
    [35, "D"],
    [34.9, "NG"],
    [0, "NG"],
  ])("maps %s%% to %s", (percent, letter) => {
    expect(gradeFor(percent).letter).toBe(letter);
  });

  it("marks NG as not counting toward a GPA", () => {
    expect(gradeFor(20).graded).toBe(false);
    expect(gradeFor(40).graded).toBe(true);
  });
});

describe("evaluate", () => {
  it("totals theory and practical", () => {
    const r = evaluate({ theory: 60, practical: 20, isAbsent: false }, WITH_PRACTICAL);
    expect(r.total).toBe(80);
    expect(r.fullMarks).toBe(100);
    expect(r.percent).toBe(80);
    expect(r.grade?.letter).toBe("A");
    expect(r.passed).toBe(true);
  });

  it("stays incomplete until every part is entered", () => {
    const r = evaluate({ theory: 60, practical: null, isAbsent: false }, WITH_PRACTICAL);
    expect(r.total).toBeNull();
    expect(r.percent).toBeNull();
    expect(r.grade).toBeNull();
    expect(r.passed).toBeNull();
  });

  it("ignores a missing practical when the subject has none", () => {
    const r = evaluate({ theory: 55, practical: null, isAbsent: false }, THEORY_ONLY);
    expect(r.total).toBe(55);
    expect(r.passed).toBe(true);
  });

  it("fails a subject on the practical however good the theory", () => {
    // 70 + 5 = 75%, an A-grade total, but the practical is below its pass mark.
    const r = evaluate({ theory: 70, practical: 5, isAbsent: false }, WITH_PRACTICAL);
    expect(r.percent).toBe(75);
    expect(r.passed).toBe(false);
    expect(r.grade?.letter).toBe("NG");
    expect(r.failedParts).toEqual(["practical"]);
  });

  it("names both parts when both fall short", () => {
    const r = evaluate({ theory: 10, practical: 2, isAbsent: false }, WITH_PRACTICAL);
    expect(r.failedParts).toEqual(["theory", "practical"]);
  });

  it("treats absent as a fail, distinct from a zero", () => {
    const absent = evaluate({ theory: null, practical: null, isAbsent: true }, THEORY_ONLY);
    expect(absent.isAbsent).toBe(true);
    expect(absent.passed).toBe(false);
    expect(absent.total).toBe(0);

    const zero = evaluate({ theory: 0, practical: null, isAbsent: false }, THEORY_ONLY);
    expect(zero.isAbsent).toBe(false);
    expect(zero.passed).toBe(false);
  });

  it("passes exactly on the pass mark", () => {
    expect(evaluate({ theory: 40, practical: null, isAbsent: false }, THEORY_ONLY).passed).toBe(true);
    expect(evaluate({ theory: 39, practical: null, isAbsent: false }, THEORY_ONLY).passed).toBe(false);
  });
});

describe("summarise", () => {
  const pass = (theory: number) => evaluate({ theory, practical: null, isAbsent: false }, THEORY_ONLY);

  it("averages grade points into a GPA", () => {
    const overall = summarise([pass(95), pass(85), pass(75)]);
    // 4.0 + 3.6 + 3.2 over three subjects.
    expect(overall.gpa).toBe(3.6);
    expect(overall.percent).toBe(85);
    expect(overall.passedAll).toBe(true);
  });

  it("withholds a GPA while any subject is incomplete", () => {
    const incomplete = evaluate({ theory: null, practical: null, isAbsent: false }, THEORY_ONLY);
    const overall = summarise([pass(90), incomplete]);
    expect(overall.complete).toBe(false);
    expect(overall.gpa).toBeNull();
    expect(overall.percent).toBeNull();
  });

  it("counts failed subjects and drags the GPA down through NG", () => {
    const overall = summarise([pass(90), pass(20)]);
    expect(overall.subjectsFailed).toBe(1);
    expect(overall.passedAll).toBe(false);
    expect(overall.gpa).toBe(2);
  });

  it("handles an empty subject list", () => {
    expect(summarise([]).gpa).toBeNull();
  });
});

describe("rank", () => {
  it("orders by total, highest first", () => {
    const rows = [{ t: 50 }, { t: 90 }, { t: 70 }];
    const positions = rank(rows, (r) => r.t);
    expect(positions.get(rows[1])).toBe(1);
    expect(positions.get(rows[2])).toBe(2);
    expect(positions.get(rows[0])).toBe(3);
  });

  it("shares a position on a tie and skips the next", () => {
    const rows = [{ t: 90 }, { t: 90 }, { t: 70 }];
    const positions = rank(rows, (r) => r.t);
    expect(positions.get(rows[0])).toBe(1);
    expect(positions.get(rows[1])).toBe(1);
    expect(positions.get(rows[2])).toBe(3);
  });

  it("leaves incomplete results unranked rather than last-placed", () => {
    const rows = [{ t: 50 }, { t: null as number | null }];
    const positions = rank(rows, (r) => r.t);
    expect(positions.get(rows[0])).toBe(1);
    expect(positions.get(rows[1])).toBeNull();
  });
});
