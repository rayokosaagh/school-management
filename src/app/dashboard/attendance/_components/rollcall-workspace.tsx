"use client";

import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BsCalendar } from "@/components/ui/bs-calendar";
import {
  RegisterTabs,
  registerTabId,
  type RegisterTab,
} from "@/components/ui/register-tabs";
import { shiftBsInput } from "@/lib/date/bs";
import { sectionCode } from "@/lib/register-codes";
import { AttendanceSheet, type SheetRow } from "./attendance-sheet";

export type RollCallSection = {
  id: number;
  name: string;
  grade: { name: string };
  /// True when this section has no roll call on the chosen day.
  missing: boolean;
};

export type RegisterRow = {
  studentId: number;
  fullName: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percent: number;
};

export function RollCallWorkspace({
  sections,
  sheets,
  initialSectionId,
  dateLabel,
  monthLabel,
  daysTaken,
  register,
  sheetError,
  yearLabel,
}: {
  sections: RollCallSection[];
  /// One entry per section, keyed by section id.
  sheets: Record<number, { rows: SheetRow[]; taken: boolean; takenBy: string | null } | null>;
  initialSectionId: number;
  /// Bikram Sambat, YYYY-MM-DD — what the sheet is keyed on.
  dateLabel: string;
  monthLabel: string;
  daysTaken: number;
  register: RegisterRow[];
  sheetError: string | null;
  yearLabel: string;
}) {
  const router = useRouter();
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const [isPending, startNavigation] = useTransition();
  const [dateInput, setDateInput] = useState(dateLabel);
  // A route change re-renders this component without remounting it, so
  // `dateInput` needs its own resync back to `dateLabel` once a navigation
  // settles. Keyed off `isPending`'s falling edge rather than off comparing
  // `dateLabel` to its previous value: a rejected date can fall back to the
  // day already on screen (e.g. typing garbage while viewing today), where
  // `dateLabel` reads the same before and after, so a value comparison would
  // never fire and the box would keep showing the rejected text. Every
  // `goToDate` call is a transition, so its completion is instead what
  // triggers the resync — regardless of whether the resolved date changed.
  // Adjusted during render rather than in an effect: see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes.
  const [awaitingSync, setAwaitingSync] = useState(false);
  if (isPending && !awaitingSync) {
    setAwaitingSync(true);
  } else if (!isPending && awaitingSync) {
    setAwaitingSync(false);
    setDateInput(dateLabel);
  }
  const [showRegister, setShowRegister] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [sectionId, setSectionId] = useState(initialSectionId);

  const sheet = sheets[sectionId] ?? null;

  // Only the date needs the server: every section's sheet for this day is
  // already here, so the tabs are local state and the URL stays put.
  function goToDate(date: string) {
    startNavigation(() => {
      router.replace(`?section=${sectionId}&date=${date}`, { scroll: false });
    });
  }

  /// Steps a Bikram Sambat date by whole days, crossing month and year
  /// boundaries correctly. A shift that does not resolve to a real BS date
  /// (malformed input, or past the calendar's supported years) is dropped
  /// rather than acted on, so the box never silently shows one date while a
  /// stale one gets saved.
  function shiftDay(by: number) {
    const next = shiftBsInput(dateInput, by);
    if (!next) return;
    setDateInput(next);
    goToDate(next);
  }

  const tabs: RegisterTab[] = sections.map((s) => ({
    id: String(s.id),
    code: sectionCode(s.grade.name, s.name),
    label: `${s.grade.name} ${s.name}`,
    // A section with no roll call today is the one that still needs doing, so
    // it is marked rather than hidden.
    empty: s.missing,
  }));

  const current = sections.find((s) => s.id === sectionId) ?? null;
  const stillToMark = sections.filter((s) => s.missing).length;

  return (
    <PageFrame
      icon={CalendarCheck}
      tint="green"
      eyebrow="Daily"
      title="Roll call"
      meta={`${dateLabel} · ${yearLabel}`}
      actions={
        <Button
          type="button"
          variant={showRegister ? "secondary" : "outline"}
          size="sm"
          aria-pressed={showRegister}
          onClick={() => setShowRegister((v) => !v)}
        >
          <CalendarDays data-icon="inline-start" aria-hidden="true" />
          Month register
        </Button>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs
          tabs={tabs}
          value={String(sectionId)}
          onChange={(id) => setSectionId(Number(id))}
          ariaLabel="Sections"
          baseId={baseId}
          panelId={panelId}
        />
      </PageFrame.Tabs>

      <PageFrame.Toolbar>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
          >
            <ChevronLeft />
          </Button>
          <Input
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            onBlur={() => dateInput !== dateLabel && goToDate(dateInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToDate(dateInput);
            }}
            aria-label="Date in Bikram Sambat"
            className="h-8 w-32 text-center font-mono"
          />
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger
              aria-label="Choose attendance date"
              title="Choose attendance date"
              className="border-line bg-surface text-ink-2 hover:bg-surface-2 focus-visible:ring-ring/50 grid size-7 place-items-center rounded-md border transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              <CalendarDays className="size-3.5" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto border-0 bg-transparent p-0 shadow-none">
              <BsCalendar
                value={dateInput}
                onChange={(next) => {
                  setDateInput(next);
                  setDatePickerOpen(false);
                  goToDate(next);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => shiftDay(1)}
            aria-label="Next day"
          >
            <ChevronRight />
          </Button>
        </div>
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          {sheet?.taken
            ? `Taken${sheet.takenBy ? ` by ${sheet.takenBy}` : ""} · saving replaces it`
            : "Not taken yet · everyone starts present"}
        </span>
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          {stillToMark === 0
            ? "All sections marked"
            : `${stillToMark} section${stillToMark === 1 ? "" : "s"} still to mark`}
        </span>
      </PageFrame.Toolbar>

      <PageFrame.Split
        aside={
          showRegister ? (
            <div className="flex min-h-0 flex-col">
              <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <p className="font-medium">{monthLabel}</p>
                  <p className="text-ink-3 text-[11.5px]">
                    {daysTaken} day{daysTaken === 1 ? "" : "s"} recorded
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowRegister(false)}
                  aria-label="Close month register"
                >
                  <X />
                </Button>
              </div>
              {register.length === 0 ? (
                <p className="text-ink-3 px-4 py-4 text-sm">
                  Nothing recorded for this section this month.
                </p>
              ) : (
                <ul className="divide-line divide-y">
                  {register.map((row) => (
                    <li
                      key={row.studentId}
                      className="flex items-baseline justify-between gap-3 px-4 py-2"
                    >
                      <span className="min-w-0 truncate text-sm">{row.fullName}</span>
                      <span className="text-ink-3 shrink-0 font-mono text-[12px]">
                        {row.present}/{row.present + row.absent + row.late + row.leave} ·{" "}
                        {row.percent}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : undefined
        }
        asideTitle="Month register"
        asideOpen={showRegister}
        onAsideClose={() => setShowRegister(false)}
      >
        <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, String(sectionId))}>
          <div className="bg-surface border-line min-h-0 flex-1 overflow-y-auto rounded-[10px] border p-4">
            <p className="mb-3 font-medium">
              {current ? `${current.grade.name} ${current.name}` : "Section"}
            </p>
            {/* A rejected `date` still has a sheet underneath it (the
                fallback day loaded fine), so the warning sits above the
                roll call rather than replacing it — only a genuine fetch
                failure (no `sheet`) leaves the message on its own. */}
            {sheetError && <p className="text-warn mb-3 text-sm">{sheetError}</p>}
            {sheet && sheet.rows.length === 0 ? (
              <p className="text-ink-3 text-sm">
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
          </div>
        </PageFrame.Body>
      </PageFrame.Split>
    </PageFrame>
  );
}
