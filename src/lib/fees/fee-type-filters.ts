/// The options for the Fees page's fee-type strip.
///
/// `rows` is every balance row in the current class, *before* the Show filter.
/// The names are taken from there and never from the filtered list: building
/// both from the filtered rows meant picking "Paid up" deleted every chip but
/// one, because barely anybody had settled more than their admission fee. A
/// filter narrows who is listed. It does not retire a fee the class is
/// charged.
///
/// The counts do honour the filter, through `passes` — and each chip is
/// counted under its own fee type, because picking one narrows the Show
/// filter to that fee as well. So a count is exactly what picking that chip
/// would put on screen, which is the only reading of it worth printing.
export type FeeTypeRow = { feeTypes: string[] };
export type FeeTypeFilter = { value: string; label: string; count: number };

export function feeTypeFilters<T extends FeeTypeRow>(
  rows: T[],
  allValue: string,
  /// Whether a row survives the Show filter when `feeType` is in view. `null`
  /// means no fee type is picked. Defaults to letting everything through.
  passes: (row: T, feeType: string | null) => boolean = () => true,
): FeeTypeFilter[] {
  const names = new Set<string>();
  for (const row of rows) for (const name of row.feeTypes) names.add(name);

  return [
    { value: allValue, label: "All fees", count: rows.filter((row) => passes(row, null)).length },
    ...[...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        value: name,
        label: name,
        // Counted once per pupil however many of their bills carry the type:
        // the chip counts students, like the class tabs beside it.
        count: rows.filter((row) => row.feeTypes.includes(name) && passes(row, name)).length,
      })),
  ];
}
