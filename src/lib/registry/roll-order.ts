/// How a section's roll numbers are handed out. Schools differ: some read the
/// register alphabetically, some rank it by the last exam, some just keep the
/// order students were admitted in.
export type RollOrder = "ALPHABETICAL" | "MARKS" | "ADMISSION";

export const ROLL_ORDER_LABEL: Record<RollOrder, string> = {
  ALPHABETICAL: "Alphabetical by name",
  MARKS: "By exam result, highest first",
  ADMISSION: "Admission order",
};

export function isRollOrder(value: string): value is RollOrder {
  return value === "ALPHABETICAL" || value === "MARKS" || value === "ADMISSION";
}

export type RollCandidate = {
  enrollmentId: number;
  fullName: string;
  admissionNo: string;
  /// Total marks in the chosen exam. Null when the student sat nothing, which
  /// must not be read as a zero.
  total: number | null;
};

/// Admission numbers are usually numeric but the column is free text, so a
/// numeric compare is used where it can be and a string compare otherwise.
function byAdmission(a: RollCandidate, b: RollCandidate) {
  const na = Number(a.admissionNo);
  const nb = Number(b.admissionNo);
  const numeric = /^\d+$/.test(a.admissionNo.trim()) && /^\d+$/.test(b.admissionNo.trim());
  if (numeric && na !== nb) return na - nb;
  if (numeric) return 0;
  return a.admissionNo.localeCompare(b.admissionNo, undefined, { numeric: true });
}

function byName(a: RollCandidate, b: RollCandidate) {
  return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" });
}

/// Puts a section's students in the order their roll numbers should follow.
/// Ties always fall back to the name, so the same input can never produce two
/// different rolls on two different runs.
export function orderForRoll(
  students: RollCandidate[],
  order: RollOrder,
): RollCandidate[] {
  const rows = [...students];

  if (order === "ALPHABETICAL") return rows.sort(byName);
  if (order === "ADMISSION") return rows.sort((a, b) => byAdmission(a, b) || byName(a, b));

  return rows.sort((a, b) => {
    // A student with no marks sits below everyone who sat the exam rather than
    // being ranked as if they scored nothing.
    if (a.total === null && b.total === null) return byName(a, b);
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    if (a.total !== b.total) return b.total - a.total;
    return byName(a, b);
  });
}
