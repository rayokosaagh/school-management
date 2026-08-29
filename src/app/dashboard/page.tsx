import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Info,
  NotebookPen,
  Download,
  FileText,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Callout, IconTile, type Tint } from "@/components/ui/page-shell";
import { currentActor } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import type { Capability } from "@/lib/auth/roles";
import { formatBs } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { getSchoolOverview, type SchoolOverview } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";

export default async function DashboardHome() {
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <Callout icon={Info} tint="amber">
          No academic year is current, so enrolments, offerings and attendance have
          nothing to attach to.{" "}
          <Link href="/dashboard/classes" className="font-medium underline">
            Set one on the Classes page
          </Link>
          .
        </Callout>
      </div>
    );
  }

  const [overview, actor, grants] = await Promise.all([
    getSchoolOverview(currentYear.id, new Date()),
    currentActor(),
    loadGrants(),
  ]);

  // Only offer a shortcut the account can actually follow.
  const can = (capability: Capability) =>
    actor ? granted(grants, actor.role, capability) : false;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Academic year {currentYear.nameBS} · {formatBs(currentYear.startsOn)} to{" "}
          {formatBs(currentYear.endsOn)}
        </p>
      </div>

      {/* A year with no sections has nothing to report on, and cards that say
          "0 of 0 marked" read as a fault rather than as an empty year. */}
      {overview.counts.sections === 0 ? (
        <YearNotSetUp nameBS={currentYear.nameBS} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <RollCallToday overview={overview} />
            <AttendanceTrend trend={overview.trend} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <NeedsAttention overview={overview} />
            <Counts overview={overview} />
          </div>
        </>
      )}

      <QuickActions
        canRegistry={can("manage:registry")}
        canAttendance={can("take:attendance")}
        canMarks={can("enter:marks")}
        canView={can("view:records")}
      />
    </div>
  );
}

/// The handful of jobs that start from here rather than from a list page.
function QuickActions({
  canRegistry,
  canAttendance,
  canMarks,
  canView,
}: {
  canRegistry: boolean;
  canAttendance: boolean;
  canMarks: boolean;
  canView: boolean;
}) {
  const actions = [
    {
      href: "/dashboard/students",
      icon: UserPlus,
      tint: "violet" as Tint,
      label: "Admit a student",
      allowed: canRegistry,
    },
    {
      href: "/dashboard/teachers",
      icon: Users,
      tint: "blue" as Tint,
      label: "Add staff",
      allowed: canRegistry,
    },
    {
      href: "/dashboard/attendance",
      icon: CalendarCheck,
      tint: "green" as Tint,
      label: "Take roll call",
      allowed: canAttendance,
    },
    {
      href: "/dashboard/exams",
      icon: FileText,
      tint: "amber" as Tint,
      label: "Enter marks",
      allowed: canMarks,
    },
    {
      href: "/api/export/students",
      icon: Download,
      tint: "rose" as Tint,
      label: "Export roll as CSV",
      allowed: canView,
      download: true,
    },
  ].filter((a) => a.allowed);

  if (actions.length === 0) return null;

  return (
    <section className="card-surface p-5">
      <h2 className="mb-4 font-semibold">Quick actions</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map((action) =>
          action.download ? (
            // A plain anchor, so the browser downloads it rather than the router
            // trying to navigate to a CSV.
            <a
              key={action.href}
              href={action.href}
              download
              className="bg-rail hover:bg-muted flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <IconTile icon={action.icon} tint={action.tint} size="sm" />
              <span className="min-w-0 truncate">{action.label}</span>
            </a>
          ) : (
            <Link
              key={action.href}
              href={action.href}
              className="bg-rail hover:bg-muted flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <IconTile icon={action.icon} tint={action.tint} size="sm" />
              <span className="min-w-0 truncate">{action.label}</span>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

/// Switching into a fresh year blanks every list, so say why rather than
/// leaving the pages looking broken.
function YearNotSetUp({ nameBS }: { nameBS: string }) {
  return (
    <section className="card-surface flex flex-col items-start gap-4 p-6">
      <IconTile icon={CalendarCheck} tint="amber" size="lg" />
      <div>
        <h2 className="text-lg font-semibold">
          Academic year {nameBS} has no classes yet
        </h2>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          Nothing is set up for this year, so students, attendance and exams are
          all empty. Add grades and sections for {nameBS}, or switch back to
          another year using the selector in the header.
        </p>
      </div>
      <Link
        href="/dashboard/classes"
        className="bg-action text-action-foreground hover:bg-action/90 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium shadow-sm"
      >
        Set up {nameBS} on the Classes page
        <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}

/// The one thing the office does every morning, with how far along it is.
function RollCallToday({ overview }: { overview: SchoolOverview }) {
  const { missingAttendance, sectionsTotal, absent } = overview.today;
  const done = sectionsTotal - missingAttendance.length;
  const pct = sectionsTotal === 0 ? 0 : Math.round((done / sectionsTotal) * 100);
  const complete = sectionsTotal > 0 && missingAttendance.length === 0;

  return (
    <section className="card-surface flex flex-col gap-4 p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile icon={CalendarCheck} tint={complete ? "green" : "amber"} />
          <div>
            <h2 className="font-semibold">Roll call today</h2>
            <p className="text-muted-foreground text-sm">
              {complete ? "All sections marked" : "Sections still waiting"}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/attendance"
          className="bg-action text-action-foreground hover:bg-action/90 inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium shadow-sm"
        >
          {complete ? "Review roll call" : "Take roll call"}
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-bold tabular-nums">
            {done}
            <span className="text-muted-foreground text-base font-medium">
              {" "}
              of {sectionsTotal} sections marked
            </span>
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">{pct}%</p>
        </div>
        <div className="bg-rail h-2 overflow-hidden rounded-full ring-1 ring-black/5 ring-inset">
          <div
            className={cn("h-full rounded-full", complete ? "bg-tint-green-fg" : "bg-action")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {complete ? (
        <p className="text-tint-green-fg flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="size-4" />
          Every section is marked. {absent} absent today.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-sm">Still to mark:</span>
          {missingAttendance.slice(0, 6).map((section) => (
            <Link
              key={section.id}
              href={`/dashboard/attendance?section=${section.id}`}
              className="bg-tint-amber text-tint-amber-fg rounded-lg px-2 py-0.5 text-xs font-medium hover:brightness-95"
            >
              {section.label}
            </Link>
          ))}
          {missingAttendance.length > 6 ? (
            <span className="text-muted-foreground text-xs">
              +{missingAttendance.length - 6} more
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}

/// Fourteen days of attendance, as the share of marked students who were in.
function AttendanceTrend({ trend }: { trend: SchoolOverview["trend"] }) {
  const marked = trend.filter((d) => d.marked > 0);
  const present = marked.reduce((sum, d) => sum + d.present, 0);
  const total = marked.reduce((sum, d) => sum + d.marked, 0);
  const rate = total === 0 ? null : Math.round((present / total) * 100);

  return (
    <section className="card-surface flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-semibold">Attendance</h2>
        <p className="text-muted-foreground text-sm">Last 14 days</p>
      </div>

      <div>
        <p className="text-2xl font-bold tabular-nums">
          {rate === null ? "—" : `${rate}%`}
          <span className="text-muted-foreground text-base font-medium"> present</span>
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {marked.length} day{marked.length === 1 ? "" : "s"} with a roll call
        </p>
      </div>

      {/* Bars are the day's present rate; an unmarked day stays empty rather
          than being drawn as zero attendance. */}
      <div className="flex h-16 items-end gap-1">
        {trend.map((day) => {
          const dayRate = day.marked === 0 ? null : day.present / day.marked;
          return (
            <div
              key={day.date.toISOString()}
              title={
                dayRate === null
                  ? `${formatBs(day.date, "YYYY-MM-DD")} · no roll call`
                  : `${formatBs(day.date, "YYYY-MM-DD")} · ${day.present}/${day.marked} present`
              }
              className="bg-rail flex h-full flex-1 items-end overflow-hidden rounded-sm"
            >
              {dayRate === null ? null : (
                <div
                  className="bg-tint-green-fg w-full rounded-sm"
                  style={{ height: `${Math.max(6, dayRate * 100)}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Gap = { label: string; href: string; count: number; tint: Tint; icon: LucideIcon };

/// Only real problems appear here, so an empty list is a meaningful answer.
function NeedsAttention({ overview }: { overview: SchoolOverview }) {
  const { gaps } = overview;
  const sections = gaps.sectionsWithoutClassTeacher.length;

  const items: Gap[] = [
    {
      label: `${sections} section${sections === 1 ? "" : "s"} without a class teacher`,
      href: "/dashboard/teachers",
      count: sections,
      tint: "blue" as Tint,
      icon: UserCog,
    },
    {
      label: `${gaps.unassignedSlots} subject${gaps.unassignedSlots === 1 ? "" : "s"} with nobody teaching them`,
      href: "/dashboard/assignments",
      count: gaps.unassignedSlots,
      tint: "rose" as Tint,
      icon: ClipboardList,
    },
    {
      label: `${gaps.unpublishedExams} exam${gaps.unpublishedExams === 1 ? "" : "s"} not published yet`,
      href: "/dashboard/exams",
      count: gaps.unpublishedExams,
      tint: "amber" as Tint,
      icon: ClipboardCheck,
    },
  ].filter((item) => item.count > 0);

  return (
    <section className="card-surface p-5">
      <h2 className="mb-4 font-semibold">Needs attention</h2>

      {items.length === 0 ? (
        <p className="text-tint-green-fg flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4" />
          Nothing outstanding — every section has a teacher and every exam is published.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="hover:bg-muted/60 group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
              >
                <IconTile icon={item.icon} tint={item.tint} size="sm" />
                <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/// The counts, kept small — they are reference, not the day's work.
function Counts({ overview }: { overview: SchoolOverview }) {
  const { counts } = overview;

  const stats = [
    {
      href: "/dashboard/students",
      icon: GraduationCap,
      tint: "violet" as Tint,
      value: counts.students,
      label: "Students",
    },
    {
      href: "/dashboard/teachers",
      icon: Users,
      tint: "blue" as Tint,
      value: counts.staffTotal,
      label: `Staff · ${counts.staffActive} active`,
    },
    {
      href: "/dashboard/classes",
      icon: BookOpen,
      tint: "green" as Tint,
      value: counts.sections,
      label: `Sections · ${counts.grades} grades`,
    },
    {
      href: "/dashboard/subjects",
      icon: NotebookPen,
      tint: "amber" as Tint,
      value: counts.offerings,
      label: `Offerings · ${counts.subjects} subjects`,
    },
  ];

  return (
    <section className="card-surface p-5">
      <h2 className="mb-4 font-semibold">The school</h2>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <Link
            key={stat.href}
            href={stat.href}
            className="hover:bg-muted/60 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
          >
            <IconTile icon={stat.icon} tint={stat.tint} size="sm" />
            <div className="min-w-0">
              <p className="text-lg leading-tight font-bold tabular-nums">{stat.value}</p>
              <p className="text-muted-foreground truncate text-xs">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
