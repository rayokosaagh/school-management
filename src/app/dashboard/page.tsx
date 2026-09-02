import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  MapPin,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi } from "@/components/ui/kpi";
import { PageFrame } from "@/components/ui/page-frame";
import { currentActor } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import type { Capability } from "@/lib/auth/roles";
import { formatBs } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { getSchoolOverview, type SchoolOverview } from "@/lib/dashboard/overview";
import {
  formatMinute,
  getTeacherScheduleForToday,
  type TodayPeriod,
} from "@/lib/dashboard/teacher-schedule";
import { cn } from "@/lib/utils";

export default async function DashboardHome() {
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No academic year is current"
        description="Enrolments, attendance and exams all hang off a year. Set one on the Classes page."
        action={
          <Button render={<Link href="/dashboard/classes" />} nativeButton={false}>
            Open Classes
          </Button>
        }
      />
    );
  }

  const actor = await currentActor();
  const now = new Date();
  const [overview, grants, todaySchedule] = await Promise.all([
    getSchoolOverview(currentYear.id, now),
    loadGrants(),
    actor?.role === "TEACHER"
      ? getTeacherScheduleForToday(actor, currentYear.id, now)
      : Promise.resolve(null),
  ]);

  // Only offer a shortcut the account can actually follow.
  const can = (capability: Capability) =>
    actor ? granted(grants, actor.role, capability) : false;

  const { counts } = overview;
  const empty = counts.sections === 0;

  return (
    <PageFrame
      eyebrow="School"
      title="Overview"
      meta={`${currentYear.nameBS} · ${formatBs(currentYear.startsOn)} to ${formatBs(currentYear.endsOn)}`}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {empty ? (
          <EmptyState
            icon={CalendarCheck}
            title={`Academic year ${currentYear.nameBS} has no classes yet`}
            description="Nothing is set up for this year, so students, attendance and exams are all empty. Add grades and sections, or switch year in the header."
            action={
              <Button render={<Link href="/dashboard/classes" />} nativeButton={false}>
                Set up {currentYear.nameBS}
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi value={counts.students} label="Students" hint={`enrolled in ${currentYear.nameBS}`} />
              <Kpi value={counts.staffTotal} label="Staff" hint={`${counts.staffActive} active`} />
              <Kpi value={counts.sections} label="Sections" hint={`${counts.grades} grades`} />
              <Kpi value={counts.offerings} label="Taught" hint={`${counts.subjects} subjects`} />
            </div>

            {todaySchedule ? <TeacherScheduleToday periods={todaySchedule} /> : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <RollCallToday overview={overview} />
              <AttendanceTrend trend={overview.trend} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <NeedsAttention overview={overview} />
              <QuickActions
                canRegistry={can("manage:registry")}
                canAttendance={can("take:attendance")}
                canMarks={can("enter:marks")}
                canView={can("view:records")}
              />
            </div>
          </>
        )}
      </div>
    </PageFrame>
  );
}

function TeacherScheduleToday({ periods }: { periods: TodayPeriod[] }) {
  return (
    <Panel
      title="My classes today"
      meta={
        periods.length > 0
          ? `${periods.length} period${periods.length === 1 ? "" : "s"}`
          : undefined
      }
    >
      {periods.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title="No classes today"
          description="Your timetable is clear for today."
          className="py-8"
        />
      ) : (
        <ol className="divide-line divide-y">
          {periods.map((period) => (
            <li
              key={period.id}
              className={cn(
                "grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]",
                period.isCurrent &&
                  "border-brand/30 bg-brand-tint -mx-2 rounded-lg border px-2",
              )}
            >
              <span className="text-ink-3">
                <span className="block font-mono text-[12px] tabular-nums">
                  {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
                </span>
                <span className="block truncate text-[11px]">{period.periodName}</span>
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{period.subject}</span>
                  {period.isCurrent ? (
                    <span className="bg-brand rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                      Now
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-3 block truncate text-[12px]">
                  {period.classSection}
                </span>
              </span>
              {/* Rooms are optional, so an unrecorded one shows nothing rather
                  than a pin pointing at a blank. */}
              {period.room ? (
                <span className="text-ink-3 col-start-2 inline-flex items-center gap-1 text-[12px] sm:col-start-auto">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {period.room}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("bg-surface border-line rounded-[10px] border p-4", className)}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.02em]">{title}</h2>
        {meta ? <span className="text-ink-3 text-[12px]">{meta}</span> : null}
      </div>
      {children}
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
    <Panel
      title="Roll call today"
      meta={
        <Link
          href="/dashboard/attendance"
          className="text-brand inline-flex items-center gap-1 font-medium"
        >
          {complete ? "Review" : "Take roll call"}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      }
      className="lg:col-span-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[28px] leading-none font-semibold tabular-nums">
          {done}
          <span className="text-ink-3 text-base font-medium"> of {sectionsTotal} marked</span>
        </p>
        <span className="text-ink-3 font-mono text-[12px]">{pct}%</span>
      </div>

      <div className="bg-surface-2 border-line mt-3 h-1.5 overflow-hidden rounded-full border">
        <div
          className={cn("h-full rounded-full", complete ? "bg-ok" : "bg-brand")}
          style={{ width: `${pct}%` }}
        />
      </div>

      {complete ? (
        <p className="text-ok mt-3 flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Every section is marked. {absent} absent today.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-ink-3 mr-1 text-[12px]">Still to mark:</span>
          {missingAttendance.slice(0, 8).map((section) => (
            <Link
              key={section.id}
              href={`/dashboard/attendance?section=${section.id}`}
              className="bg-warn-tint text-warn rounded-md px-2 py-0.5 text-[12px] font-medium"
            >
              {section.label}
            </Link>
          ))}
          {missingAttendance.length > 8 ? (
            <span className="text-ink-3 text-[12px]">
              +{missingAttendance.length - 8} more
            </span>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/// Fourteen days of attendance, as the share of marked students who were in.
function AttendanceTrend({ trend }: { trend: SchoolOverview["trend"] }) {
  const marked = trend.filter((d) => d.marked > 0);
  const present = marked.reduce((sum, d) => sum + d.present, 0);
  const total = marked.reduce((sum, d) => sum + d.marked, 0);
  const rate = total === 0 ? null : Math.round((present / total) * 100);

  return (
    <Panel title="Attendance" meta="last 14 days">
      <p className="font-display text-[28px] leading-none font-semibold tabular-nums">
        {rate === null ? "—" : `${rate}%`}
        <span className="text-ink-3 text-base font-medium"> present</span>
      </p>
      <p className="text-ink-3 mt-1 text-[12px]">
        {marked.length} day{marked.length === 1 ? "" : "s"} with a roll call
      </p>

      {/* Bars are the day's present rate; an unmarked day stays empty rather
          than being drawn as zero attendance. */}
      <div className="mt-3 flex h-12 items-end gap-1">
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
              className="bg-surface-2 border-line flex h-full flex-1 items-end overflow-hidden rounded-sm border"
            >
              {dayRate === null ? null : (
                <div
                  className="bg-ok w-full rounded-sm"
                  style={{ height: `${Math.max(6, dayRate * 100)}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

type Gap = { label: string; href: string; count: number; icon: LucideIcon };

/// Only real problems appear here, so an empty list is a meaningful answer.
function NeedsAttention({ overview }: { overview: SchoolOverview }) {
  const { gaps } = overview;
  const sections = gaps.sectionsWithoutClassTeacher.length;

  const items: Gap[] = [
    {
      label: `${sections} section${sections === 1 ? "" : "s"} without a class teacher`,
      href: "/dashboard/classes",
      count: sections,
      icon: UserCog,
    },
    {
      label: `${gaps.unassignedSlots} subject${gaps.unassignedSlots === 1 ? "" : "s"} with nobody teaching them`,
      href: "/dashboard/assignments",
      count: gaps.unassignedSlots,
      icon: ClipboardList,
    },
    {
      label: `${gaps.unpublishedExams} exam${gaps.unpublishedExams === 1 ? "" : "s"} not published yet`,
      href: "/dashboard/exams",
      count: gaps.unpublishedExams,
      icon: ClipboardCheck,
    },
  ].filter((item) => item.count > 0);

  return (
    <Panel title="Needs attention" meta={items.length === 0 ? undefined : `${items.length}`}>
      {items.length === 0 ? (
        <p className="text-ok flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Nothing outstanding — every section has a teacher and every exam is published.
        </p>
      ) : (
        <ul className="divide-line divide-y">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:bg-surface-2 group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
                >
                  <Icon className="text-warn size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                  <ArrowRight className="text-ink-3 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
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
    { href: "/dashboard/students", icon: UserPlus, label: "Admit a student", allowed: canRegistry },
    { href: "/dashboard/teachers", icon: Users, label: "Add staff", allowed: canRegistry },
    { href: "/dashboard/attendance", icon: CalendarCheck, label: "Take roll call", allowed: canAttendance },
    { href: "/dashboard/exams", icon: FileText, label: "Enter marks", allowed: canMarks },
    {
      href: "/api/export/students",
      icon: Download,
      label: "Export roll as CSV",
      allowed: canView,
      download: true,
    },
  ].filter((a) => a.allowed);

  if (actions.length === 0) return null;

  return (
    <Panel title="Quick actions">
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const className =
            "border-line bg-surface-2 hover:bg-surface flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
          return action.download ? (
            // A plain anchor, so the browser downloads it rather than the router
            // trying to navigate to a CSV.
            <a key={action.href} href={action.href} download className={className}>
              <Icon className="text-ink-3 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{action.label}</span>
            </a>
          ) : (
            <Link key={action.href} href={action.href} className={className}>
              <Icon className="text-ink-3 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
