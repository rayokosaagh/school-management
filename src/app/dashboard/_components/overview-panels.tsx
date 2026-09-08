import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight, BookOpen, CalendarCheck, CheckCircle2, ClipboardCheck,
  Clock3, MapPin, Sparkles, TriangleAlert, Users,
} from "lucide-react";
import type { DashboardOverview, TrendDay } from "@/lib/dashboard/overview";
import { dueItems } from "@/lib/dashboard/alerts";
import { rollCallStanding } from "@/lib/dashboard/standing";
import type { MarksGap, MoneyToday, WatchedPupil } from "@/lib/dashboard/insights";
import type { TodayPeriod } from "@/lib/dashboard/teacher-schedule";
import { formatMinute } from "@/lib/timetable/schedule";
import { formatBs } from "@/lib/date/bs";
import { cn, focusRing as focus } from "@/lib/utils";
import { PersonName } from "@/components/ui/person-name";
import { TranslatedText } from "@/components/i18n/language-provider";

function Panel({ title, description, action, children }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="bg-surface border-line min-w-0 rounded-xl border p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold"><TranslatedText>{title}</TranslatedText></h2>
          {description ? <p className="text-ink-3 mt-1 text-xs leading-5"><TranslatedText>{description}</TranslatedText></p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn("text-brand inline-flex items-center gap-1.5 rounded-md text-xs font-semibold", focus)}>
      {children}<ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

function Quiet({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-lg px-4 py-6 text-center">
      <span className="text-brand mx-auto mb-3 flex w-fit">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-ink-3 mx-auto mt-1 max-w-sm text-xs leading-5">{children}</p>
    </div>
  );
}

export function Schedule({ periods, schoolDay, canTimetable }: {
  periods: TodayPeriod[]; schoolDay: boolean; canTimetable: boolean;
}) {
  const visible = schoolDay ? periods : [];
  return (
    <Panel
      title="My teaching day"
      description={schoolDay ? `${visible.length} scheduled lesson${visible.length === 1 ? "" : "s"} today` : "Your timetable for this academic year"}
      action={canTimetable ? <TextLink href="/dashboard/classes?view=timetable"><TranslatedText>Full week</TranslatedText></TextLink> : null}
    >
      {visible.length === 0 ? (
        <Quiet icon={<Clock3 className="size-6" aria-hidden="true" />} title={schoolDay ? "No lessons scheduled today" : "No teaching due today"}>
          <TranslatedText>{schoolDay ? "Your day is clear. Your weekly timetable shows the rest of your teaching schedule." : "Today is outside the school week or this academic year."}</TranslatedText>
        </Quiet>
      ) : (
        <ol className="space-y-2">
          {visible.map((period) => (
            <li key={period.id} className={cn("grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 rounded-lg p-3 sm:grid-cols-[5rem_minmax(0,1fr)]", period.isCurrent ? "bg-brand-tint border-brand/20 border" : "bg-surface-2 border border-transparent")}>
              <div className="border-line border-r pr-3 text-xs tabular-nums">
                <p className="font-semibold">{formatMinute(period.startMinute)}</p>
                <p className="text-ink-3 mt-1">{formatMinute(period.endMinute)}</p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-sm font-semibold">{period.subject}</p>
                  {period.isCurrent ? <span className="bg-brand text-brand-ink rounded-full px-2 py-0.5 text-[10px] font-semibold"><TranslatedText>Now</TranslatedText></span> : null}
                </div>
                <p className="text-ink-3 mt-1 break-words text-xs">{period.classSection} · {period.periodName}</p>
                {period.room ? <p className="text-ink-3 mt-2 flex items-center gap-1 text-xs"><MapPin className="size-3 shrink-0" aria-hidden="true" />{period.room}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function RollCall({ overview }: { overview: DashboardOverview }) {
  if (!overview.access.attendance) return null;
  const { total, saved, percent, pending: missing, due } = rollCallStanding(overview);
  return (
    <Panel title="Roll call today" description={overview.scope === "teacher" ? "Attendance in the sections you teach or lead" : "A live view across your school"}
      action={<TextLink href="/dashboard/attendance"><TranslatedText>Open roll call</TranslatedText></TextLink>}>
      {!due ? (
        <Quiet icon={<CalendarCheck className="size-6" aria-hidden="true" />} title="No roll call due today"><TranslatedText>
          Today is outside the school week or this academic year. You can still review saved registers.
        </TranslatedText></Quiet>
      ) : total === 0 ? (
        <Quiet icon={<Users className="size-6" aria-hidden="true" />} title="No sections available"><TranslatedText>Attendance appears here when sections are ready.</TranslatedText></Quiet>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-5">
            <div aria-hidden="true" className="grid size-24 shrink-0 place-items-center rounded-full p-2" style={{ background: `conic-gradient(var(--brand) ${percent}%, var(--surface-2) 0)` }}>
              <div className="bg-surface grid size-full place-items-center rounded-full font-display text-xl font-semibold tabular-nums">{percent}%</div>
            </div>
            <div>
              <p className="font-display text-3xl font-semibold tabular-nums">{saved}<span className="text-ink-3 text-lg font-normal"> / {total}</span></p>
              <p className="text-ink-3 mt-1 text-xs"><TranslatedText>sections saved · </TranslatedText>{percent}<TranslatedText>% complete</TranslatedText></p>
              <p className="text-ink-3 mt-2 text-xs">{overview.today.absent}<TranslatedText> absent in saved registers</TranslatedText></p>
            </div>
          </div>
          {missing.length > 0 ? (
            <div className="border-line mt-5 border-t pt-4">
              <p className="text-ink-3 mb-2 text-xs"><TranslatedText>Waiting for roll call</TranslatedText></p>
              <div className="flex flex-wrap gap-2">
                {missing.slice(0, 6).map((section) => (
                  <Link key={section.id} href={`/dashboard/attendance?section=${section.id}`} className={cn("bg-warn-tint text-warn rounded-md px-2.5 py-2 text-xs font-medium", focus)}>{section.label}<span className="sr-only"><TranslatedText>: take roll call</TranslatedText></span></Link>
                ))}
                {missing.length > 6 ? <span className="text-ink-3 self-center text-xs">+{missing.length - 6}<TranslatedText> more</TranslatedText></span> : null}
              </div>
            </div>
          ) : <p className="text-ok mt-5 flex items-center gap-2 text-xs font-medium"><CheckCircle2 className="size-4" aria-hidden="true" /><TranslatedText>Every section has a saved register.</TranslatedText></p>}
        </>
      )}
    </Panel>
  );
}

export function Classes({ overview }: { overview: DashboardOverview }) {
  const teacher = overview.scope === "teacher";
  return (
    <Panel title={teacher ? "My sections" : "Class sections"} description={teacher ? "The classes you teach or lead this year" : "Students and attendance, section by section"}>
      {overview.sections.length === 0 ? (
        <Quiet icon={<BookOpen className="size-6" aria-hidden="true" />} title={teacher ? "No sections assigned yet" : "No sections available"}>
          <TranslatedText>{teacher ? "Ask your administrator to link your teaching or class teacher assignments." : "Sections appear here when they are set up and available to your account."}</TranslatedText>
        </Quiet>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {overview.sections.slice(0, 8).map((section) => {
            const content = <>
              <div className="flex items-start justify-between gap-2">
                <p className="break-words text-sm font-semibold">{section.label}</p>
                {overview.access.attendance ? <ArrowRight className="text-ink-3 mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : null}
              </div>
              {overview.access.records ? <p className="text-ink-3 mt-1 text-xs">{section.students}<TranslatedText> student</TranslatedText><TranslatedText>{section.students === 1 ? "" : "s"}</TranslatedText></p> : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.isClassTeacher ? <span className="bg-brand-tint text-brand-text rounded px-1.5 py-0.5 text-[10px] font-medium"><TranslatedText>Class teacher</TranslatedText></span> : null}
                {overview.access.attendance && overview.schoolDay ? <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", section.attendanceTaken ? "bg-ok-tint text-ok" : "bg-warn-tint text-warn")}><TranslatedText>{section.attendanceTaken ? "Roll call saved" : "Roll call pending"}</TranslatedText></span> : null}
              </div>
            </>;
            const className = "bg-surface-2 border-line min-w-0 rounded-lg border p-3.5";
            return overview.access.attendance ? (
              <Link key={section.id} href={`/dashboard/attendance?section=${section.id}`} className={cn(className, "hover:border-brand/40 transition-colors", focus)}>{content}</Link>
            ) : <div key={section.id} className={className}>{content}</div>;
          })}
        </div>
      )}
      {overview.sections.length > 8 ? <p className="text-ink-3 mt-3 text-xs"><TranslatedText>Showing 8 of </TranslatedText>{overview.sections.length}<TranslatedText> sections</TranslatedText><TranslatedText>{overview.access.attendance ? ". Open roll call to see all." : "."}</TranslatedText></p> : null}
    </Panel>
  );
}

export function AttendanceTrend({ trend, teacher }: { trend: TrendDay[]; teacher: boolean }) {
  const total = trend.reduce((sum, day) => sum + day.marked, 0);
  const present = trend.reduce((sum, day) => sum + day.present, 0);
  const rate = total === 0 ? null : Math.round(present / total * 100);
  return (
    <Panel title="Attendance over time" description={teacher ? "Your sections · last 14 days" : "School attendance · last 14 days"}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-display text-3xl font-semibold tabular-nums"><TranslatedText>{rate === null ? "—" : `${rate}%`}</TranslatedText></p>
        <p className="text-ink-3 text-xs"><TranslatedText>{rate === null ? "No attendance recorded" : "present, including late arrivals"}</TranslatedText></p>
      </div>
      <div className="mt-5 flex h-24 items-end gap-1.5" aria-hidden="true">
        {trend.map((day) => {
          const percentage = day.marked === 0 ? null : day.present / day.marked * 100;
          return <div key={day.date.toISOString()} className="bg-surface-2 relative flex h-full min-w-0 flex-1 items-end overflow-hidden rounded-t-sm">
            {percentage === null ? <span className="border-line absolute bottom-0 w-full border-t border-dashed" /> : <span className="bg-brand w-full rounded-t-sm" style={{ height: `${percentage}%`, minHeight: percentage === 0 ? "2px" : undefined }} />}
          </div>;
        })}
      </div>
      {trend.length > 0 ? <div className="text-ink-3 mt-2 flex justify-between gap-2 text-[10px]"><span>{formatBs(trend[0].date, "MMM DD")}</span><span>{formatBs(trend[trend.length - 1].date, "MMM DD")}</span></div> : null}
      <p className="text-ink-3 mt-3 text-xs leading-5"><TranslatedText>Empty columns mean no register was saved. A baseline means 0% present.</TranslatedText></p>
      <details className="border-line mt-4 border-t pt-3">
        <summary className={cn("text-brand w-fit cursor-pointer rounded text-xs font-medium", focus)}><TranslatedText>Daily attendance details</TranslatedText></summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only"><TranslatedText>Daily present and recorded student counts</TranslatedText></caption>
            <thead className="text-ink-3"><tr><th scope="col" className="py-2 font-medium"><TranslatedText>Date</TranslatedText></th><th scope="col" className="py-2 text-right font-medium"><TranslatedText>Present / recorded</TranslatedText></th></tr></thead>
            <tbody className="divide-line divide-y">{trend.map((day) => <tr key={day.date.toISOString()}><th scope="row" className="py-2 font-normal">{formatBs(day.date, "MMM DD")}</th><td className="py-2 text-right tabular-nums"><TranslatedText>{day.marked === 0 ? "Not recorded" : `${day.present} / ${day.marked}`}</TranslatedText></td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

export function Attention({ overview }: { overview: DashboardOverview }) {
  const { access } = overview;
  // Roll call has a panel of its own directly above this one; repeating it
  // here would be the same duplication in a new place.
  const items = dueItems(overview).filter((item) => item.key !== "attendance");
  if (!access.registry && !access.manageExams && !access.fees) return null;
  return (
    <Panel title="Needs attention" description="The next steps for your school">
      {items.length === 0 ? <Quiet icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title="No outstanding setup tasks"><TranslatedText>Nothing is waiting on you in the areas you manage.</TranslatedText></Quiet> : (
        <ul className="divide-line divide-y">
          {items.map((item) => <li key={item.key}>
            <Link href={item.href} className={cn("hover:bg-surface-2 -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors", focus)}>
              <span className="bg-warn-tint text-warn mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums">{item.count}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="text-ink-3 mt-1 block text-xs leading-5">{item.detail}</span></span>
              <TriangleAlert className="text-warn mt-1 size-4 shrink-0" aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
      )}
    </Panel>
  );
}

export function PersonalActivity({ overview }: { overview: DashboardOverview }) {
  const rows = [
    { icon: CalendarCheck, label: "Roll calls saved", value: overview.personal.attendanceTaken },
    { icon: ClipboardCheck, label: "Conduct entries", value: overview.personal.conductRecorded },
    { icon: Sparkles, label: "Activity entries", value: overview.personal.activitiesRecorded },
  ];
  return (
    <Panel title="My activity today" description="Records attributed to your account today">
      <dl className="divide-line divide-y">{rows.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><Icon className="text-brand size-4 shrink-0" aria-hidden="true" /><dt className="text-ink-2 flex-1 text-xs">{label}</dt><dd className="font-display text-lg font-semibold tabular-nums">{value}</dd></div>)}</dl>
    </Panel>
  );
}

/// What a teacher still owes the exam office.
///
/// Only unpublished terms appear: a published exam's marks are history, and a
/// row that can never clear is noise on a dashboard, not a task.
export function MarksToEnter({ gaps }: { gaps: MarksGap[] }) {
  return (
    <Panel
      title="Marks still to enter"
      description="Your subjects in exams that have not been published"
      action={<TextLink href="/dashboard/exams"><TranslatedText>Open mark sheets</TranslatedText></TextLink>}
    >
      {gaps.length === 0 ? (
        <Quiet icon={<ClipboardCheck className="size-6" aria-hidden="true" />} title="Nothing waiting on you"><TranslatedText>
          Every unpublished exam has a mark for each of your pupils.
        </TranslatedText></Quiet>
      ) : (
        <ul className="space-y-2">
          {gaps.map((gap) => {
            const done = gap.expected === 0 ? 0 : Math.round((gap.entered / gap.expected) * 100);
            return (
              <li key={gap.key} className="bg-surface-2 border-line rounded-lg border p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="break-words text-sm font-semibold">{gap.subject}</p>
                  <p className="text-ink-3 text-xs tabular-nums">
                    {gap.entered}<TranslatedText> of </TranslatedText>{gap.expected}<TranslatedText> entered
                  </TranslatedText></p>
                </div>
                <p className="text-ink-3 mt-1 text-xs">{gap.term}</p>
                <div className="bg-surface mt-2.5 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                  <div className="bg-brand h-full rounded-full" style={{ width: `${done}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/// Pupils whose absence has become a pattern.
///
/// Names, not a number: "4 pupils are often away" is a statistic, and the
/// point of putting it on a class teacher's dashboard is that they can picture
/// the child and ask after them.
export function PupilsToWatch({ pupils }: { pupils: WatchedPupil[] }) {
  return (
    <Panel
      title="Pupils to watch"
      description="Three or more absences in your classes over the last fortnight"
      action={<TextLink href="/dashboard/attendance"><TranslatedText>Open roll call</TranslatedText></TextLink>}
    >
      {pupils.length === 0 ? (
        <Quiet icon={<CheckCircle2 className="size-6" aria-hidden="true" />} title="Nobody is slipping"><TranslatedText>
          No pupil in your classes has missed three days in the last fortnight.
        </TranslatedText></Quiet>
      ) : (
        <ul className="divide-line divide-y">
          {pupils.map((pupil) => (
            <li key={pupil.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="bg-warn-tint text-warn grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums">
                {pupil.absences}
              </span>
              <span className="min-w-0 flex-1">
                <PersonName en={pupil.name} np={pupil.nameNp} className="text-sm" />
                <span className="text-ink-3 mt-0.5 block text-xs">{pupil.section}</span>
              </span>
              <span className="text-ink-3 text-xs"><TranslatedText>days away</TranslatedText></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/// Where the money stands, for the people who chase it.
export function MoneyPanel({ money }: { money: MoneyToday }) {
  const collectedPercent = money.billed === 0 ? 0 : Math.round((money.collected / money.billed) * 100);
  return (
    <Panel
      title="Fees today"
      description="Collections against everything billed this year"
      action={<TextLink href="/dashboard/fees"><TranslatedText>Open fees</TranslatedText></TextLink>}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-display text-3xl font-semibold tabular-nums">{money.collectedToday.toLocaleString("en-US")}</p>
        <p className="text-ink-3 text-xs"><TranslatedText>rupees taken today</TranslatedText></p>
      </div>
      <dl className="mt-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2 text-xs"><TranslatedText>Still outstanding</TranslatedText></dt>
          <dd className="text-sm font-semibold tabular-nums">{money.outstanding.toLocaleString("en-US")}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2 text-xs"><TranslatedText>Collected this year</TranslatedText></dt>
          <dd className="text-ink-2 text-sm tabular-nums">{money.collected.toLocaleString("en-US")}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2 text-xs"><TranslatedText>Billed this year</TranslatedText></dt>
          <dd className="text-ink-2 text-sm tabular-nums">{money.billed.toLocaleString("en-US")}</dd>
        </div>
      </dl>
      <div className="bg-surface-2 mt-4 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-ok h-full rounded-full" style={{ width: `${collectedPercent}%` }} />
      </div>
      <p className="text-ink-3 mt-2 text-xs">{collectedPercent}<TranslatedText>% of what has been billed is in.</TranslatedText></p>
    </Panel>
  );
}
