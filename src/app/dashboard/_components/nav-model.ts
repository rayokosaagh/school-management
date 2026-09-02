import {
  BookOpen,
  CalendarCheck,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { id: string; label: string; href: string; icon: LucideIcon };
export type NavGroup = { id: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "people",
    items: [
      { id: "home", label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { id: "students", label: "Students", href: "/dashboard/students", icon: GraduationCap },
      { id: "teachers", label: "Staff", href: "/dashboard/teachers", icon: Users },
    ],
  },
  {
    id: "timetable",
    items: [
      { id: "classes", label: "Classes", href: "/dashboard/classes", icon: BookOpen },
      { id: "subjects", label: "Subjects", href: "/dashboard/subjects", icon: NotebookPen },
      { id: "assignments", label: "Teaching", href: "/dashboard/assignments", icon: ClipboardList },
      { id: "timetable", label: "Timetable", href: "/dashboard/timetable", icon: CalendarRange },
    ],
  },
  {
    id: "daily",
    items: [
      { id: "attendance", label: "Roll call", href: "/dashboard/attendance", icon: CalendarCheck },
      { id: "exams", label: "Exams", href: "/dashboard/exams", icon: ClipboardCheck },
      { id: "honours", label: "Honours", href: "/dashboard/honours", icon: Trophy },
    ],
  },
];

export const SETTINGS: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/dashboard/settings",
  icon: Settings,
};

/// The bottom bar on phones. Everything else moves into the account menu.
export const MOBILE_IDS = ["home", "students", "teachers", "attendance", "exams"];

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
