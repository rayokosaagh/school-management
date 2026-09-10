"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck, CalendarDays, ClipboardCheck, GraduationCap, Layers3, Settings2, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import type { Actor } from "@/lib/auth/scope";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { DashboardOverview } from "@/lib/dashboard/overview";
import { rollCallStanding } from "@/lib/dashboard/standing";
import type { TodayPeriod } from "@/lib/dashboard/teacher-schedule";
import { formatBs, formatBsNepali } from "@/lib/date/bs";
import { cn, focusRing } from "@/lib/utils";
import { Schedule, RollCall, Classes, AttendanceTrend, Attention, PersonalActivity, MarksToEnter, PupilsToWatch, MoneyPanel } from "./overview-panels";
import type { RoleInsights } from "@/lib/dashboard/insights";
import { AnnouncementsPanel } from "./announcements-panel";
import type { AnnouncementCard } from "@/lib/announcements/announcements";
import { TranslatedText, useLanguage } from "@/components/i18n/language-provider";

type Props = {
  actor: Actor; yearLabel: string; overview: DashboardOverview; periods: TodayPeriod[];
  announcements: AnnouncementCard[]; manageableAnnouncements: AnnouncementCard[];
  insights: RoleInsights;
  /// Set when `requirePage` bounced the visitor here from a section their
  /// account cannot open. Same treatment as the Students register's notice.
  notice: string | null;
};
type Action = { label: string; detail: string; href: string; icon: LucideIcon };

export function OverviewWorkspace({ actor, yearLabel, overview: o, periods, insights, announcements, manageableAnnouncements, notice }: Props) {
  const { language, t } = useLanguage();
  const teacher = actor.role === "TEACHER";
  const office = actor.role === "OFFICE";
  const { access: a, counts: c } = o;
  // One reading of roll call for the hero line, the tile and the button below.
  const roll = rollCallStanding(o);
  const missing = roll.pending.length;
  const actions: Action[] = [
    ...(a.attendance ? [{ label: "Take attendance", detail: teacher ? "Open your class register" : "Open the daily register", href: "/dashboard/attendance", icon: CalendarCheck }] : []),
    ...(a.marks ? [{ label: "Enter marks", detail: teacher ? "Update your subject results" : "Open exam mark sheets", href: "/dashboard/exams", icon: ClipboardCheck }] : []),
    ...(a.fees ? [{ label: "Manage fees", detail: "Invoices and collections", href: "/dashboard/fees", icon: Wallet }] : []),
    ...(a.registry && a.records ? [{ label: "Student admissions", detail: "Manage the student register", href: "/dashboard/students", icon: GraduationCap }] : []),
    ...(a.timetable ? [{ label: teacher ? "My weekly timetable" : "Class timetable", detail: "Plan the week ahead", href: "/dashboard/classes?view=timetable", icon: CalendarDays }] : []),
    ...(a.settings ? [{ label: "School settings", detail: "Accounts and permissions", href: "/dashboard/settings", icon: Settings2 }] : []),
  ];
  const primary = roll.due && missing > 0
    ? { label: teacher ? "Mark my class" : "Open roll call", href: `/dashboard/attendance?section=${o.today.missingAttendance[0].id}` }
    : teacher && a.timetable ? { label: "View my timetable", href: "/dashboard/classes?view=timetable" }
    : office && a.fees ? { label: "Open fee collections", href: "/dashboard/fees" }
    : actions[0];
  const metrics = [
    ...(a.records ? [{ label: teacher ? "My students" : "Students enrolled", value: c.students, note: teacher ? "Across your assigned classes" : `Academic year ${yearLabel}`, icon: GraduationCap }] : []),
    ...(a.records || a.attendance || a.marks ? [{ label: teacher ? "My classes" : "Class sections", value: c.sections, note: teacher ? "Classes you teach or lead" : `${c.grades} grades this year`, icon: Layers3 }] : []),
    ...(teacher ? [{ label: "Lessons today", value: periods.length, note: o.schoolDay ? "From your weekly timetable" : "No teaching scheduled today", icon: BookOpen }]
      : a.registry ? [{ label: "Active staff", value: c.staffActive, note: `${c.staffTotal} staff records`, icon: Users }] : []),
    ...(a.attendance ? [{ label: "Roll calls pending", value: missing, note: roll.due ? (teacher ? "In your assigned classes" : "Across the school today") : "No roll call due today", icon: CalendarCheck }]
      : a.marks ? [{ label: teacher ? "My teaching assignments" : "Teaching assignments", value: c.assignments, note: "Section and subject pairs", icon: ClipboardCheck }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-2">
      {notice ? (
        <p role="status" className="text-warn bg-warn-tint border-warn/30 rounded-lg border px-3 py-2 text-sm">{notice}</p>
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-ink-3 text-[11px] font-medium uppercase tracking-[0.16em]">{t(teacher ? "My workspace" : office ? "Office workspace" : "School workspace")}</p>
          <h1 className="mt-1">{t("Overview")}</h1>
        </div>
        <span className="bg-surface border-line text-ink-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <ShieldCheck className="text-brand size-3.5" aria-hidden="true" />{t(ROLE_LABEL[actor.role])}
          <span className="text-line-strong" aria-hidden="true">/</span>{yearLabel}<TranslatedText> BS
        </TranslatedText></span>
      </header>

      <section className="relative isolate overflow-hidden rounded-2xl bg-brand-deep px-6 py-7 text-white sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-36 -z-10 size-[420px] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-20 -z-10 size-[290px] rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-medium text-white/75"><CalendarDays className="size-3.5" aria-hidden="true" />{language === "ne" ? formatBsNepali(o.today.date, "dddd, DD MMMM YYYY") : formatBs(o.today.date, "dddd, DD MMMM YYYY")}</p>
            <h2 className="font-display mt-3 break-words text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{t("Welcome back")}, {actor.username}.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">{t(teacher ? "Your classes, your students, and a little more room to focus on teaching." : office ? "Keep the school day moving. Your registers, records, and daily tasks are all here." : "A clear picture of your school, with the details that need your attention.")}</p>
            {primary ? <Link href={primary.href} className="mt-5 inline-flex min-h-10 items-center gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand-deep)] transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep">{t(primary.label)}<ArrowRight className="size-4" aria-hidden="true" /></Link> : null}
          </div>
          <div className="w-full rounded-xl border border-white/15 bg-white/[0.06] p-4 lg:w-64 lg:shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">{t(roll.due ? "Today’s focus" : "A quieter day")}</p>
            <p className="mt-2 text-lg font-semibold"><TranslatedText>{!roll.due ? "No roll call due" : missing > 0 ? `${missing} ${missing === 1 ? "class needs" : "classes need"} roll call` : teacher ? "Make time for your classes" : "Ready for the day"}</TranslatedText></p>
            <p className="mt-1 text-xs leading-5 text-white/70"><TranslatedText>{!roll.due ? "Today is a non-working day or outside the selected academic year. You can still review your records." : missing > 0 ? "Start with the attendance registers still waiting to be marked." : "Use your shortcuts below to pick up where you left off."}</TranslatedText></p>
          </div>
        </div>
      </section>

      {teacher && (actor.staffId === null || c.sections === 0) ? (
        <div className="bg-brand-tint border-brand-tint-2 flex items-start gap-3 rounded-xl border p-4">
          <BookOpen className="text-brand-text mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div><h2 className="text-sm font-semibold"><TranslatedText>{actor.staffId === null ? "Let’s connect your teaching profile" : "Your classes will appear here"}</TranslatedText></h2>
            <p className="text-ink-2 mt-1 text-sm leading-5"><TranslatedText>{actor.staffId === null ? "Ask your administrator to link this account to your staff record. Your timetable and classes will then appear here." : "You have no visible classes for this academic year. Your administrator can check your teaching assignments and access."}</TranslatedText></p>
          </div>
        </div>
      ) : null}

      {metrics.length ? <section aria-label={t("At a glance")} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <div key={label} className="bg-surface border-line rounded-xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2"><p className="text-ink-2 text-xs font-medium">{t(label)}</p><Icon className="text-brand size-4" aria-hidden="true" /></div>
            <p className="font-display mt-3 text-[30px] font-semibold leading-none tracking-tight tabular-nums">{value.toLocaleString("en-US")}</p>
            <p className="text-ink-3 mt-2 text-[11px] leading-4">{t(note)}</p>
          </div>
        ))}
      </section> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <AnnouncementsPanel items={announcements} manageable={manageableAnnouncements} canPost={a.announce} />
          {teacher ? <Schedule periods={periods} schoolDay={o.schoolDay} canTimetable={a.timetable} /> : null}
          {a.attendance ? <RollCall overview={o} /> : null}
          {office ? <PersonalActivity overview={o} /> : null}
          {teacher && a.marks ? <MarksToEnter gaps={insights.marks} /> : null}
          {a.attendance ? <PupilsToWatch pupils={insights.watch} ownClasses={teacher} /> : null}
          {a.records || a.attendance || a.marks ? <Classes overview={o} /> : null}
          {!teacher && (a.registry || a.manageExams) ? <Attention overview={o} /> : null}
        </div>
        <aside aria-label={t("Your tools and insights")} className="min-w-0 space-y-5">
          <section className="bg-surface border-line rounded-xl border">
            <div className="border-line border-b px-5 py-4"><h2 className="text-sm font-semibold">{t("Quick access")}</h2><p className="text-ink-3 mt-1 text-xs">{t("Your everyday tools, one step away.")}</p></div>
            <div className="space-y-1 p-4">
              {actions.length ? actions.map(({ icon: Icon, ...action }) => (
                <Link key={action.href} href={action.href} className={cn("group hover:bg-surface-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 transition-colors", focusRing)}>
                  <span className="bg-brand-tint text-brand-text grid size-9 shrink-0 place-items-center rounded-lg"><Icon className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t(action.label)}</span><span className="text-ink-3 mt-0.5 block text-xs">{t(action.detail)}</span></span>
                  <ArrowRight className="text-ink-3 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              )) : <p className="text-ink-3 py-3 text-sm leading-6"><TranslatedText>Your administrator can enable the tools you need for your work.</TranslatedText></p>}
            </div>
          </section>
          {insights.money ? <MoneyPanel money={insights.money} /> : null}
          {a.attendance ? <AttendanceTrend trend={o.trend} teacher={teacher} /> : null}
          {!office ? <PersonalActivity overview={o} /> : null}
          <div className="border-line rounded-xl border border-dashed px-5 py-4">
            <p className="text-ink-2 flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="text-brand size-4" aria-hidden="true" />{t("Your workspace")}</p>
            <p className="text-ink-3 mt-2 text-xs leading-5"><TranslatedText>{teacher ? "This overview only includes classes you teach or lead in the selected year." : office ? "Your office overview brings together the school records and operations your account can manage." : "Your administrator overview covers school operations, staffing, and setup for the selected year."}</TranslatedText></p>
          </div>
        </aside>
      </div>
    </div>
  );
}
