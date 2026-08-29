import Link from "next/link";
import { CalendarCheck, CalendarDays, ClipboardCheck, Info } from "lucide-react";
import { Callout, PageHeader, SectionCard } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AttendanceError,
  getSheet,
  monthlyRegister,
  sectionCalendar,
  sectionsMissingAttendance,
  todayBsLabel,
} from "@/lib/attendance/attendance";
import { AttendanceMap } from "@/components/ui/attendance-map";
import { adToBs, formatBs, parseBsInput, BS_MONTHS } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSections } from "@/lib/registry/structure";
import { AttendanceSheet } from "./_components/attendance-sheet";

import { requirePage } from "@/lib/auth/guard";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; date?: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/attendance");

  const params = await searchParams;
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader icon={CalendarCheck} tint="green" title="Attendance" />
        <Callout icon={Info} tint="amber">
          Set a current academic year on the Classes page first.
        </Callout>
      </div>
    );
  }

  const sections = await listSections(currentYear.id);

  if (sections.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader icon={CalendarCheck} tint="green" title="Attendance" />
        <Callout icon={Info} tint="amber">
          Add a section on the Classes page first.
        </Callout>
      </div>
    );
  }

  // Default to today, clamped into the academic year so the sheet is never asked
  // for a date the year does not contain.
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const clampedToday =
    todayUtc < currentYear.startsOn
      ? currentYear.startsOn
      : todayUtc > currentYear.endsOn
        ? currentYear.endsOn
        : todayUtc;

  const requestedDate = params.date ? parseBsInput(params.date) : null;
  const date = requestedDate ?? clampedToday;
  const dateLabel = todayBsLabel(date);

  const requestedSection = Number(params.section);
  const sectionId =
    sections.find((s) => s.id === requestedSection)?.id ?? sections[0].id;

  let sheet = null;
  let sheetError: string | null = null;
  try {
    sheet = await getSheet(sectionId, date);
  } catch (e) {
    sheetError =
      e instanceof AttendanceError ? e.message : "Could not load that sheet.";
  }

  const bs = adToBs(date);
  const [missing, register, calendar] = await Promise.all([
    sectionsMissingAttendance(currentYear.id, date),
    monthlyRegister(sectionId, bs.year, bs.month),
    sectionCalendar(sectionId, currentYear.startsOn, currentYear.endsOn),
  ]);

  const mapDays = calendar.map((day) => ({
    date: day.date,
    rate: day.rate,
    label:
      day.total === 0
        ? "no students"
        : `${day.present + day.late}/${day.total} in · ${day.absent} absent${day.leave ? `, ${day.leave} on leave` : ""}`,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={CalendarCheck}
        tint="green"
        title="Attendance"
        meta={[formatBs(date, "YYYY MMMM DD, dddd"), currentYear.nameBS]}
      />

      <SectionCard
        icon={CalendarDays}
        tint="blue"
        title="Pick a day"
        description="One roll call per section per day. Dates are Bikram Sambat."
      >
        <div className="space-y-4">
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="section" value={sectionId} />
            <Input
              name="date"
              defaultValue={dateLabel}
              placeholder="2082-01-15"
              className="max-w-40"
            />
            <Button type="submit" variant="outline">
              Go
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`/dashboard/attendance?section=${section.id}&date=${dateLabel}`}
                className={
                  section.id === sectionId
                    ? "bg-primary text-primary-foreground rounded-lg px-2.5 py-1.5 text-sm font-medium"
                    : "border-input hover:bg-muted rounded-lg border px-2.5 py-1.5 text-sm"
                }
              >
                {section.grade.name} {section.name}
              </Link>
            ))}
          </div>

          {missing.length > 0 ? (
            <Callout icon={Info} tint="amber">
              Not yet taken today:{" "}
              {missing.map((s) => `${s.grade.name} ${s.name}`).join(", ")}
            </Callout>
          ) : (
            <Callout icon={Info} tint="green">
              Every section has been taken for this day.
            </Callout>
          )}
        </div>
      </SectionCard>

      <SectionCard
        icon={CalendarCheck}
        tint="green"
        title={`Attendance across ${currentYear.nameBS}`}
        description="One square per day. Darker means more of the roll attended."
      >
        <AttendanceMap
          from={currentYear.startsOn}
          to={currentYear.endsOn}
          days={mapDays}
          caption={sheet ? `${sheet.section.grade.name} ${sheet.section.name}` : undefined}
        />
      </SectionCard>

      <SectionCard
        icon={ClipboardCheck}
        tint="violet"
        title={sheet ? `${sheet.section.grade.name} ${sheet.section.name}` : "Sheet"}
        description={
          sheetError
            ? sheetError
            : sheet?.taken
              ? `Already taken${sheet.takenBy ? ` by ${sheet.takenBy}` : ""}. Saving again replaces it.`
              : "Not taken yet. Everyone starts as present."
        }
      >
          {sheetError ? null : sheet && sheet.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active students are enrolled in this section.
            </p>
          ) : sheet ? (
            <AttendanceSheet
              // Statuses and leave notes are seeded from `rows`; a different
              // section or day is a different sheet.
              key={`${sectionId}-${dateLabel}`}
              sectionId={sectionId}
              date={dateLabel}
              rows={sheet.rows}
              taken={sheet.taken}
            />
          ) : null}
      </SectionCard>

      <SectionCard
        icon={CalendarDays}
        tint="amber"
        title={`${BS_MONTHS[bs.month - 1]} ${bs.year}`}
        description={`${register.daysTaken} day${register.daysTaken === 1 ? "" : "s"} recorded this month. Late counts as attending; absent does not.`}
      >
          {register.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing recorded for this section this month.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Present</th>
                    <th className="py-2 pr-3 font-medium">Absent</th>
                    <th className="py-2 pr-3 font-medium">Late</th>
                    <th className="py-2 pr-3 font-medium">Leave</th>
                    <th className="py-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {register.rows.map((row) => (
                    <tr key={row.studentId} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{row.fullName}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{row.present}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{row.absent}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{row.late}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{row.leave}</td>
                      <td className="py-1.5 tabular-nums">{row.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>
    </div>
  );
}
