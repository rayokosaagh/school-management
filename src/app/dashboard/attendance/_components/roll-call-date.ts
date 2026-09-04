import { todayBsLabel } from "@/lib/attendance/attendance";
import { parseBsInput } from "@/lib/date/bs";

export type RollCallDateResolution = {
  /// The date to load the sheet and register for. Always set — there is
  /// always a date to show, even when the request named a bad one.
  date: Date;
  /// Set only when the requested date was rejected, so the page can say so
  /// instead of silently substituting another day. Mirrors the `sheetError`
  /// `assertWithinYear` (src/lib/attendance/attendance.ts) already produces
  /// for a date that parses but falls outside the academic year.
  error: string | null;
};

/// Decides which date the roll-call page shows, and what — if anything — to
/// tell the operator about it. `page.tsx` derives both the date box and the
/// register from this one result, so they can no longer disagree: an
/// unparseable `date` query param used to fall back to today silently, which
/// left the box showing whatever was typed while the register (and a save)
/// applied to today instead.
export function resolveRollCallDate(
  raw: string | undefined,
  bounds: { startsOn: Date; endsOn: Date },
  today: Date,
): RollCallDateResolution {
  const clampedToday =
    today < bounds.startsOn ? bounds.startsOn : today > bounds.endsOn ? bounds.endsOn : today;

  // No `date` param at all is the common case (first visit, or the "today"
  // link) — that must stay silent, not read as a rejected value.
  if (!raw) return { date: clampedToday, error: null };

  const parsed = parseBsInput(raw);
  // A date that parses fine is used as given, even if it turns out to sit
  // outside the academic year — that case is already reported per-section as
  // `sheetError` by `assertWithinYear`, and duplicating it here would just
  // race that message with a different wording.
  if (parsed) return { date: parsed, error: null };

  return {
    date: clampedToday,
    error: `"${raw}" is not a valid date — showing ${todayBsLabel(clampedToday)} instead.`,
  };
}
