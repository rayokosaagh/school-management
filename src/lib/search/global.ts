// Ranking for the global palette. Kept free of Prisma so the ordering rules —
// which is where a search quietly goes wrong — can be tested without a
// database.

/// How well a query meets one record: 0 when a field starts with it, 1 when a
/// field merely holds it, null when none does. Lower is better, so the scores
/// sort straight into the order the palette wants.
export function matchScore(
  query: string,
  fields: (string | null | undefined)[],
): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  let best: number | null = null;
  for (const field of fields) {
    if (!field) continue;
    const value = field.toLowerCase();
    if (value.startsWith(q)) return 0;
    if (best === null && value.includes(q)) best = 1;
  }
  return best;
}

/// The matching items, prefix hits first and at most `limit` of them. Ties keep
/// the order they arrived in, so a caller's own sort — roll number, grade
/// order — survives inside each band.
export function rank<T>(
  items: T[],
  query: string,
  fieldsOf: (item: T) => (string | null | undefined)[],
  limit = 5,
): T[] {
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = matchScore(query, fieldsOf(item));
    if (score !== null) scored.push({ item, score });
  }
  // Array.prototype.sort is stable, which is what keeps the incoming order.
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.item);
}
