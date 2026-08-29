import type { SchoolOverview } from "./overview";

export type DueItem = {
  key: string;
  label: string;
  href: string;
  tone: "warn" | "bad" | "neutral";
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/// What the office should look at today, in the order it matters. Pure so the
/// top bar and (later) the Overview welcome line agree.
export function dueItems(o: Pick<SchoolOverview, "today" | "gaps">): DueItem[] {
  const items: DueItem[] = [];

  const missing = o.today.missingAttendance.length;
  if (missing > 0) {
    items.push({
      key: "attendance",
      label: `${plural(missing, "section", "sections")} still ${missing === 1 ? "needs" : "need"} roll call`,
      href: "/dashboard/attendance",
      tone: "warn",
    });
  }

  if (o.gaps.unpublishedExams > 0) {
    items.push({
      key: "exams",
      label: `${plural(o.gaps.unpublishedExams, "exam", "exams")} not published yet`,
      href: "/dashboard/exams",
      tone: "neutral",
    });
  }

  for (const s of o.gaps.sectionsWithoutClassTeacher) {
    items.push({
      key: `class-teacher-${s.id}`,
      label: `${s.label} has no class teacher`,
      href: "/dashboard/classes",
      tone: "warn",
    });
  }

  if (o.gaps.unassignedSlots > 0) {
    items.push({
      key: "assignments",
      label: `${plural(o.gaps.unassignedSlots, "subject slot has", "subject slots have")} no teacher`,
      href: "/dashboard/assignments",
      tone: "neutral",
    });
  }

  return items;
}
