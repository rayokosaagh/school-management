import type { SchoolOverview } from "./overview";

/// How roll call stands today.
///
/// Four places on the Overview describe this one fact — the hero card, the
/// "Roll calls pending" tile, the primary call to action and the roll call
/// panel — and they used to work it out separately. The panel counted saved
/// registers against every section in scope; the header counted a list the
/// server had already emptied on a non-teaching day. On a holiday with three
/// of fourteen registers saved, one said "no roll call due" while the other
/// said "3 / 14, 21% complete". Neither was wrong about its own number, which
/// is why the disagreement survived so long.
export type RollCallStanding = {
  /// Sections the reader can see, whether or not a register is owed today.
  total: number;
  saved: number;
  pending: { id: number; label: string }[];
  /// 0 when there is nothing to be complete about, rather than NaN.
  percent: number;
  /// Whether a register is actually owed today. False outside the school week,
  /// outside the academic year, or for a reader who cannot take attendance.
  due: boolean;
};

export function rollCallStanding(
  o: Pick<SchoolOverview, "sections" | "today" | "schoolDay" | "access">,
): RollCallStanding {
  const total = o.today.sectionsTotal;
  const saved = o.sections.filter((section) => section.attendanceTaken).length;
  return {
    total,
    saved,
    pending: o.today.missingAttendance,
    percent: total === 0 ? 0 : Math.round((saved / total) * 100),
    due: o.schoolDay && o.access.attendance,
  };
}
