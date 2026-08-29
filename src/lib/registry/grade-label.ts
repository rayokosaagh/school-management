// Grade names are long ("Senior Kindergarten"), so lists that show many at once
// need a short form. Nothing is stored — the short form is derived on read.

/// "Class 7" -> "7", "Senior Kindergarten" -> "SK", anything else -> initials.
export function shortGrade(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "";

  // A trailing number is the grade itself, so it is the only part worth keeping.
  const numbered = /(\d+)\s*$/.exec(trimmed);
  if (numbered) return numbered[1];

  const words = trimmed.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return words.map((word) => word[0]!.toUpperCase()).join("");
}

/// Grades in their own order, shortened and joined — "K, SK, 1, 2, 3".
export function shortGradeList(names: string[], limit = 6): string {
  const shown = names.slice(0, limit).map(shortGrade);
  const extra = names.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
}
