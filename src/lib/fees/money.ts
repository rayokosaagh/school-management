/// Every amount in the fee ledger is whole rupees. Paise never appear on a
/// school receipt, and an integer column keeps a year of totals exact.
///
/// Its own module so the client bundle can format money without pulling in the
/// Prisma client that the rest of `fees.ts` needs.
export function money(amount: number) {
  // An explicit locale, not the ambient one: this formats on the server (inside
  // a validation message) and in the browser (in the ledger table), and the two
  // must not disagree — a differing separator is a hydration mismatch.
  return `Rs. ${amount.toLocaleString("en-US")}`;
}
