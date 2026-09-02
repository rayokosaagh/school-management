/// A stable, readable code for a database row. The numbers are the real ids, so
/// two people reading the same code are looking at the same record; the prefix
/// and padding exist so a code cannot be mistaken for a roll number or a count.
///
/// Codes are derived on read and never stored — renaming a prefix here changes
/// every screen at once and invalidates nothing.
export function recordCode(prefix: string, id: number): string {
  if (!Number.isInteger(id) || id < 0) return "—";
  return `${prefix}-${String(id).padStart(4, "0")}`;
}

/// A student's code follows the admission number the school already issues,
/// not the database id: admission 1 is STU-01, and the sequence has no gaps.
/// Padded to two so short numbers line up; a longer one simply runs longer.
/// A non-numeric admission number is shown exactly as the school wrote it.
export function studentCode(admissionNo: string): string {
  const value = admissionNo.trim();
  if (value === "") return "—";
  return /^\d+$/.test(value) ? `STU-${value.padStart(2, "0")}` : `STU-${value}`;
}

export const CODE = {
  staff: (id: number) => recordCode("STF", id),
  section: (id: number) => recordCode("SEC", id),
  exam: (id: number) => recordCode("EXM", id),
  subject: (id: number) => recordCode("SUB", id),
} as const;
