"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  School,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; href: string; icon: LucideIcon };
type Group = { heading?: string; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ id: "home", label: "Overview", href: "/dashboard", icon: LayoutDashboard }] },
  {
    heading: "People",
    items: [
      { id: "students", label: "Students", href: "/dashboard/students", icon: GraduationCap },
      { id: "teachers", label: "Staff", href: "/dashboard/teachers", icon: Users },
    ],
  },
  {
    heading: "Timetable",
    items: [
      { id: "classes", label: "Classes", href: "/dashboard/classes", icon: BookOpen },
      { id: "subjects", label: "Subjects", href: "/dashboard/subjects", icon: NotebookPen },
      { id: "assignments", label: "Teaching", href: "/dashboard/assignments", icon: ClipboardList },
    ],
  },
  {
    heading: "Daily",
    items: [
      { id: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck },
      { id: "exams", label: "Exams & marks", href: "/dashboard/exams", icon: ClipboardCheck },
    ],
  },
];

/// Longest matching prefix wins, so /dashboard/students does not also light up
/// Overview at /dashboard.
function activeId(pathname: string) {
  const all = [...GROUPS.flatMap((g) => g.items), SETTINGS];
  return (
    all
      .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.id ?? ""
  );
}

const SETTINGS: Item = {
  id: "settings",
  label: "Settings",
  href: "/dashboard/settings",
  icon: Settings,
};

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
        active
          ? "bg-tint-blue text-tint-blue-fg font-medium"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {/* A rail on the active item, so the current page reads at a glance
          without relying on the tint alone. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full transition-opacity",
          active ? "bg-action opacity-100" : "opacity-0",
        )}
      />
      <Icon className="size-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AppSidebar({
  schoolName,
  username,
  roleLabel,
  allowed,
}: {
  schoolName: string;
  username: string;
  roleLabel: string;
  /// Nav ids this account may open, worked out by the layout against the stored
  /// permission matrix. Hiding a link is a courtesy; the pages enforce it.
  allowed: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const current = activeId(pathname);

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.includes(i.id)),
  })).filter((g) => g.items.length > 0);

  async function logOut() {
    setSigningOut(true);
    // redirect: false keeps NextAuth from doing a hard document navigation, so
    // the client router stays in charge and the cache is cleared properly.
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="bg-surface border-border/60 hidden w-60 shrink-0 flex-col border-r md:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="bg-action text-action-foreground grid size-9 shrink-0 place-items-center rounded-xl">
          <School className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={schoolName}>
            {schoolName}
          </p>
          <p className="text-muted-foreground truncate text-[11px]">School management</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
        {groups.map((group, i) => (
          <div key={group.heading ?? `g${i}`} className="space-y-0.5">
            {group.heading ? (
              <p className="text-muted-foreground/70 px-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase">
                {group.heading}
              </p>
            ) : null}
            {group.items.map((item) => (
              <NavLink key={item.id} item={item} active={current === item.id} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-border/60 space-y-0.5 border-t px-4 py-3">
        {allowed.includes("settings") ? (
          <NavLink item={SETTINGS} active={current === "settings"} />
        ) : null}
        <button
          type="button"
          onClick={logOut}
          disabled={signingOut}
          className="text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
        >
          <LogOut className="size-4 shrink-0" strokeWidth={1.8} />
          {signingOut ? "Signing out…" : "Log out"}
        </button>

        <div className="mt-2 flex items-center gap-2.5 px-2.5 pt-2">
          <span className="bg-muted text-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold uppercase">
            {username.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{username}</p>
            <p className="text-muted-foreground truncate text-[11px]">{roleLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
