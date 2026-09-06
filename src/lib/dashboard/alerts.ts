import type { SchoolOverview } from "./overview";

export type DueItem = {
  key: string;
  /// One line, for the top bar's popover, where there is no room to explain.
  label: string;
  /// The same fact with room to breathe, for the Overview's panel.
  detail: string;
  /// What the badge counts. A per-section item is always 1.
  count: number;
  href: string;
  tone: "warn" | "bad" | "neutral";
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/// What the school should look at today, in the order it matters.
///
/// The one list behind both readings of it. The top bar and the Overview's
/// "Needs attention" panel used to build this separately from the same `gaps`
/// object, with different wording, a different order, and — because only one
/// of them was ever updated — no fee row in the top bar at all. The comment
/// this replaces promised the two would agree; sharing the list is what makes
/// that true rather than hoped for.
///
/// Filtered by what the reader may actually do, so neither caller has to: an
/// alert is a shortcut into a page, and it is worth no more than the
/// permission to open that page.
export function dueItems(o: Pick<SchoolOverview, "today" | "gaps" | "access">): DueItem[] {
  const { access, gaps } = o;
  const items: DueItem[] = [];

  const missing = o.today.missingAttendance.length;
  if (access.attendance && missing > 0) {
    items.push({
      key: "attendance",
      label: `${plural(missing, "section", "sections")} still ${missing === 1 ? "needs" : "need"} roll call`,
      detail: "Registers still waiting to be marked today.",
      count: missing,
      href: "/dashboard/attendance",
      tone: "warn",
    });
  }

  if (access.manageExams && gaps.unpublishedExams > 0) {
    items.push({
      key: "exams",
      label: `${plural(gaps.unpublishedExams, "exam", "exams")} not published yet`,
      detail: "Review results before publishing.",
      count: gaps.unpublishedExams,
      href: "/dashboard/exams",
      tone: "neutral",
    });
  }

  if (access.registry) {
    for (const s of gaps.sectionsWithoutClassTeacher) {
      items.push({
        key: `class-teacher-${s.id}`,
        label: `${s.label} has no class teacher`,
        detail: "Complete class leadership assignments.",
        count: 1,
        href: "/dashboard/classes",
        tone: "warn",
      });
    }

    if (gaps.unassignedSlots > 0) {
      items.push({
        key: "assignments",
        label: `${plural(gaps.unassignedSlots, "subject slot has", "subject slots have")} no teacher`,
        detail: "Match subjects with their teachers.",
        count: gaps.unassignedSlots,
        href: "/dashboard/assignments",
        tone: "neutral",
      });
    }
  }

  if (access.fees && gaps.unbilledMonths > 0) {
    items.push({
      key: "fees",
      label: `${plural(gaps.unbilledMonths, "month", "months")} not yet billed`,
      detail: "Months that have started with no bill sent.",
      count: gaps.unbilledMonths,
      href: "/dashboard/fees",
      tone: "warn",
    });
  }

  return items;
}
