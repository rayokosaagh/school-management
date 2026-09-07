/// Short codes for the register tab badges. Pure and shared, so the Students
/// and Staff strips cannot drift apart.

/// "Kindergarten" → "K", "Class 10" → "10", "Senior Kindergarten" → "SK".
/// A grade names itself by its number where it has one, and by its initials
/// where it does not.
export function gradeCode(gradeName: string) {
  const num = gradeName.match(/\d+/)?.[0];
  if (num) return num;
  return gradeName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/// "Kindergarten A" → "KA", "Class 10 B" → "10B", "Senior Kindergarten A" → "SKA".
export function sectionCode(gradeName: string, sectionName: string) {
  return `${gradeCode(gradeName)}${sectionName.toUpperCase()}`;
}

/// "Vice Principal" → "VP", "Teacher" → "T".
export function designationCode(d: string) {
  return d.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3) || "?";
}

/// The tab a register lands on when it mounts. A deep link to a specific row
/// switches to that row's own tab so the pane never opens over a table that
/// has filtered the row away; anything else — no selection, or a selection
/// that names no row — opens the broadest view rather than an arbitrary
/// first slice, so a fresh visit shows the whole school instead of one tab.
export function initialRegisterTab(linkedTabId: number | string | null | undefined, all: string): string {
  return linkedTabId != null ? String(linkedTabId) : all;
}
