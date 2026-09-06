import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  ReceiptText,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Tint } from "@/components/ui/page-shell";

export type NavItem = { id: string; label: string; href: string; icon: LucideIcon; tint: Tint };
export type NavGroup = { id: string; items: NavItem[] };

// Each area's tint is its identity: the same colour tints its rail item, its
// page header icon and its empty states, so a person recognises where they
// are before reading the title. Picked so no two items that sit next to each
// other in the rail (including across a group divider) share a tint — see
// the report for the full reasoning per area.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "people",
    items: [
      { id: "home", label: "Overview", href: "/dashboard", icon: LayoutDashboard, tint: "violet" },
      { id: "students", label: "Students", href: "/dashboard/students", icon: GraduationCap, tint: "green" },
      { id: "teachers", label: "Staff", href: "/dashboard/teachers", icon: Users, tint: "amber" },
    ],
  },
  {
    id: "timetable",
    items: [
      { id: "classes", label: "Classes", href: "/dashboard/classes", icon: BookOpen, tint: "violet" },
      { id: "subjects", label: "Subjects", href: "/dashboard/subjects", icon: NotebookPen, tint: "amber" },
      { id: "assignments", label: "Teaching", href: "/dashboard/assignments", icon: ClipboardList, tint: "green" },
      // Timetable lives inside Classes now (?view=timetable); /dashboard/timetable
      // still redirects there for bookmarks.
    ],
  },
  {
    id: "daily",
    items: [
      { id: "attendance", label: "Roll call", href: "/dashboard/attendance", icon: CalendarCheck, tint: "green" },
      { id: "exams", label: "Exams", href: "/dashboard/exams", icon: ClipboardCheck, tint: "amber" },
      { id: "fees", label: "Fees", href: "/dashboard/fees", icon: ReceiptText, tint: "rose" },
      // Honours lives inside Students now (?view=honours); /dashboard/honours
      // still redirects there for bookmarks.
    ],
  },
];

export const SETTINGS: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/dashboard/settings",
  icon: Settings,
  tint: "violet",
};

/// The bottom bar on phones. Everything else moves into the account menu.
export const MOBILE_IDS = ["home", "students", "teachers", "attendance", "fees"];

const ALL: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS];

/// Longest matching prefix wins, so /dashboard/students does not also light up
/// Overview at /dashboard.
export function activeId(pathname: string): string {
  return (
    ALL.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.id ?? ""
  );
}

/// Hiding a link is a courtesy; the pages enforce permissions themselves.
export function visibleGroups(allowed: string[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowed.includes(i.id)) }))
    .filter((g) => g.items.length > 0);
}
