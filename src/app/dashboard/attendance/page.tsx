import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AttendanceError,
  getSheet,
  monthlyRegister,
  sectionsMissingAttendance,
  todayBsLabel,
} from "@/lib/attendance/attendance";
import { adToBs, parseBsInput, BS_MONTHS } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSections } from "@/lib/registry/structure";
import { RollCallWorkspace } from "./_components/rollcall-workspace";

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
      <EmptyState
        icon={CalendarCheck}
        title="No academic year is current"
        description="Set one on the Classes page before taking a roll call."
      />
    );
  }

  const sections = await listSections(currentYear.id);
  if (sections.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No sections yet"
        description="Add a section on the Classes page before taking a roll call."
      />
    );
  }

  // Default to today, clamped into the academic year so the sheet is never
  // asked for a date the year does not contain.
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

  // Every section's sheet for this day, so the tab strip switches without a
  // round trip. One small query per section, and there are a dozen or so.
  const loaded = await Promise.all(
    sections.map(async (s) => {
      try {
        const sheet = await getSheet(s.id, date);
        return {
          id: s.id,
          sheet: { rows: sheet.rows, taken: sheet.taken, takenBy: sheet.takenBy ?? null },
          error: null as string | null,
        };
      } catch (e) {
        return {
          id: s.id,
          sheet: null,
          error:
            e instanceof AttendanceError ? e.message : "Could not load that sheet.",
        };
      }
    }),
  );
  const sheets = Object.fromEntries(loaded.map((l) => [l.id, l.sheet]));
  // Only the section on screen gets to report its failure.
  const sheetError = loaded.find((l) => l.id === sectionId)?.error ?? null;

  const bs = adToBs(date);
  const [missing, register] = await Promise.all([
    sectionsMissingAttendance(currentYear.id, date),
    monthlyRegister(sectionId, bs.year, bs.month),
  ]);
  const missingIds = new Set(missing.map((s) => s.id));

  return (
    <RollCallWorkspace
      sections={sections.map((s) => ({
        id: s.id,
        name: s.name,
        grade: { name: s.grade.name },
        missing: missingIds.has(s.id),
      }))}
      sheets={sheets}
      initialSectionId={sectionId}
      dateLabel={dateLabel}
      monthLabel={`${BS_MONTHS[bs.month - 1]} ${bs.year}`}
      daysTaken={register.daysTaken}
      register={register.rows}
      sheetError={sheetError}
      yearLabel={currentYear.nameBS}
    />
  );
}
