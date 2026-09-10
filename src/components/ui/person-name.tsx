import { cn } from "@/lib/utils";

/// A person's name in both scripts: the English spelling, and under it the
/// Nepali one where the record carries it.
///
/// Schools here keep both — the English name is what the software and the
/// exam boards use, the Nepali one is what the family, the roll call and every
/// printed certificate use — so a register showing only one of them is only
/// half a register. The Nepali line is quieter and smaller: it identifies, it
/// does not compete with the name the table sorts by.
///
/// Records with no Nepali name render exactly as they did before, so a school
/// that has not filled the field in sees no ragged half-empty column.
export function PersonName({
  en,
  np,
  suffix,
  className,
}: {
  en: string;
  np?: string | null;
  /// Trails the English name on its own line — a roll number, a relation.
  suffix?: React.ReactNode;
  /// Applies to the block as a whole. Both lines truncate inside it, so a
  /// long Nepali name cannot widen a column the English name fits.
  className?: string;
}) {
  return (
    <span className={cn("block min-w-0 font-medium", className)}>
      <span className="block truncate">
        {en}
        {suffix}
      </span>
      {np ? (
        <span className="font-devanagari text-ink-3 block truncate text-caption leading-tight font-normal">
          {np}
        </span>
      ) : null}
    </span>
  );
}

/// The same pair on one line, for the places that cannot take two: a select
/// option, an accessible name, a printed field. Falls back to the English name
/// alone rather than leaving a trailing separator.
export function personLabel(en: string, np?: string | null): string {
  return np?.trim() ? `${en} · ${np}` : en;
}

/// Everything a person can be found by, for a search haystack — so typing
/// "आशा" finds the same row "Asha" does.
export function personSearch(en: string, np?: string | null): string {
  return np?.trim() ? `${en} ${np}` : en;
}
