/// Reads a positive integer id from a form.
///
/// `Number("")` and `Number(null)` are both 0, which passes `Number.isInteger`,
/// so a missing field would otherwise reach the database as id 0.
export function numericField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
