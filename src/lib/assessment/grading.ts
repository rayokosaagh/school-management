// NEB letter grades and grade points. Kept as one table so a marksheet, a
// ledger and a report card can never disagree about what 72% means.

export type Grade = {
  letter: string;
  point: number;
  /// Non-graded results do not count toward a GPA.
  graded: boolean;
};

const SCALE: { min: number; letter: string; point: number }[] = [
  { min: 90, letter: "A+", point: 4.0 },
  { min: 80, letter: "A", point: 3.6 },
  { min: 70, letter: "B+", point: 3.2 },
  { min: 60, letter: "B", point: 2.8 },
  { min: 50, letter: "C+", point: 2.4 },
  { min: 40, letter: "C", point: 2.0 },
  { min: 35, letter: "D", point: 1.6 },
];

export const NON_GRADED: Grade = { letter: "NG", point: 0, graded: false };

export function gradeFor(percent: number): Grade {
  for (const band of SCALE) {
    if (percent >= band.min) {
      return { letter: band.letter, point: band.point, graded: true };
    }
  }
  return NON_GRADED;
}

export type MarkInput = {
  theory: number | null;
  practical: number | null;
  isAbsent: boolean;
};

export type Scheme = {
  fullMarksTheory: number;
  passMarksTheory: number;
  hasPractical: boolean;
  fullMarksPractical: number | null;
  passMarksPractical: number | null;
};

export type SubjectResult = {
  /// The marks as entered, echoed back so a marksheet can print them without
  /// carrying the raw row alongside the computed result.
  theory: number | null;
  practical: number | null;
  /// Null until every part of the mark has been entered.
  total: number | null;
  fullMarks: number;
  percent: number | null;
  grade: Grade | null;
  /// Null while incomplete; a subject is passed only if every part is passed.
  passed: boolean | null;
  isAbsent: boolean;
  /// Which parts fell short, for the ledger's remarks column.
  failedParts: ("theory" | "practical")[];
};

export function evaluate(mark: MarkInput, scheme: Scheme): SubjectResult {
  const fullMarks =
    scheme.fullMarksTheory + (scheme.hasPractical ? (scheme.fullMarksPractical ?? 0) : 0);

  if (mark.isAbsent) {
    return {
      theory: null,
      practical: null,
      total: 0,
      fullMarks,
      percent: 0,
      grade: NON_GRADED,
      passed: false,
      isAbsent: true,
      failedParts: [],
    };
  }

  const needsPractical = scheme.hasPractical;
  const missing =
    mark.theory === null || (needsPractical && mark.practical === null);

  if (missing) {
    return {
      theory: mark.theory,
      practical: mark.practical,
      total: null,
      fullMarks,
      percent: null,
      grade: null,
      passed: null,
      isAbsent: false,
      failedParts: [],
    };
  }

  const theory = mark.theory ?? 0;
  const practical = needsPractical ? (mark.practical ?? 0) : 0;
  const total = theory + practical;
  const percent = fullMarks === 0 ? 0 : (total / fullMarks) * 100;

  // Theory and practical are passed separately: scoring well in one does not
  // carry the other.
  const failedParts: ("theory" | "practical")[] = [];
  if (theory < scheme.passMarksTheory) failedParts.push("theory");
  if (needsPractical && practical < (scheme.passMarksPractical ?? 0)) {
    failedParts.push("practical");
  }

  const grade = gradeFor(percent);

  return {
    theory,
    practical: needsPractical ? practical : null,
    total,
    fullMarks,
    percent,
    // A subject failed on a component is non-graded however high the total.
    grade: failedParts.length > 0 ? NON_GRADED : grade,
    passed: failedParts.length === 0,
    isAbsent: false,
    failedParts,
  };
}

export type Overall = {
  /// Null while any subject is incomplete — a partial GPA misleads.
  gpa: number | null;
  percent: number | null;
  passedAll: boolean | null;
  complete: boolean;
  subjectsFailed: number;
};

export function summarise(results: SubjectResult[]): Overall {
  if (results.length === 0) {
    return { gpa: null, percent: null, passedAll: null, complete: false, subjectsFailed: 0 };
  }

  const complete = results.every((r) => r.total !== null);
  const subjectsFailed = results.filter((r) => r.passed === false).length;

  if (!complete) {
    return { gpa: null, percent: null, passedAll: null, complete: false, subjectsFailed };
  }

  const obtained = results.reduce((sum, r) => sum + (r.total ?? 0), 0);
  const outOf = results.reduce((sum, r) => sum + r.fullMarks, 0);
  const points = results.reduce((sum, r) => sum + (r.grade?.point ?? 0), 0);

  return {
    gpa: Math.round((points / results.length) * 100) / 100,
    percent: outOf === 0 ? 0 : Math.round((obtained / outOf) * 10000) / 100,
    passedAll: subjectsFailed === 0,
    complete: true,
    subjectsFailed,
  };
}

/// Highest total first. Incomplete results sort last rather than as zero.
export function rank<T>(rows: T[], totalOf: (row: T) => number | null) {
  const ordered = [...rows].sort((a, b) => {
    const x = totalOf(a);
    const y = totalOf(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  });

  const positions = new Map<T, number | null>();
  let lastTotal: number | null = Number.NaN;
  let lastPosition = 0;

  ordered.forEach((row, index) => {
    const total = totalOf(row);
    if (total === null) {
      positions.set(row, null);
      return;
    }
    // Equal totals share a position, and the next one skips accordingly.
    if (total !== lastTotal) {
      lastPosition = index + 1;
      lastTotal = total;
    }
    positions.set(row, lastPosition);
  });

  return positions;
}
