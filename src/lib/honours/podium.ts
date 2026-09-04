import type { HonoursStudent } from "./honours";

// Selects who appears where in a section's honours display. Kept free of
// React so the "does a search change the podium" question is a pure-function
// test, not a rendered one. `honours.ts` already returns each section's
// students ranked first (in position order), then the unranked by roll — both
// functions here lean on that order rather than re-sorting.

/// A section's podium: its actual top three, in order. Always computed from
/// every student in the section — never from a filtered subset — so a search
/// box can never promote a lower-ranked or unranked student onto it. A
/// section with fewer than three ranked students leaves the later slots
/// empty (the caller pads with `null`, see podium.tsx).
export function podiumStudents(students: HonoursStudent[]): HonoursStudent[] {
  return students.filter((s) => s.position !== null).slice(0, 3);
}

/// Rows for the list below the podium: everyone ranked past third place, then
/// everyone still unranked, each optionally narrowed by a search query. The
/// "past third place" cut is by index into the full roster (matching
/// `podiumStudents`), not by position value, so a tie for third is excluded
/// from both consistently. Because this starts from the same full roster as
/// the podium, a query matching only a low-ranked or unranked student surfaces
/// them here without ever touching the podium.
export function rankedListRows(
  students: HonoursStudent[],
  query = "",
): { ranked: HonoursStudent[]; waiting: HonoursStudent[] } {
  const q = query.trim().toLowerCase();
  const matches = (s: HonoursStudent) =>
    q === "" || `${s.fullName} ${s.fullNameNp ?? ""}`.toLowerCase().includes(q);

  return {
    ranked: students.filter((s) => s.position !== null).slice(3).filter(matches),
    waiting: students.filter((s) => s.position === null).filter(matches),
  };
}
