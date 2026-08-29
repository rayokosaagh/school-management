/// Short codes for the register tab badges. Pure and shared, so the Students
/// and Staff strips cannot drift apart.

/// "Kindergarten A" → "KA", "Class 10 B" → "10B", "Senior Kindergarten A" → "SKA".
export function sectionCode(gradeName: string, sectionName: string) {
  const num = gradeName.match(/\d+/)?.[0];
  const letters = num ? "" : gradeName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return `${num ?? letters}${sectionName.toUpperCase()}`;
}

/// "Vice Principal" → "VP", "Teacher" → "T".
export function designationCode(d: string) {
  return d.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3) || "?";
}
