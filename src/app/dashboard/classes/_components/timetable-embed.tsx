"use client";

// The Timetable view, embedded inside Classes rather than owning its own
// route. Two shapes:
//
// - TimetableEditView: everything the old /dashboard/timetable page rendered
//   — Week / By teacher / School day, the shape switcher, the per-shape bell
//   editor, clear timetable — unchanged in behaviour. Only its chrome moved:
//   it no longer owns a PageFrame (Classes' one PageFrame covers both views
//   now, same as Honours folding into Students), so the Week/By
//   teacher/School day Segmented that used to sit in the page's title row
//   now sits in a toolbar row instead. manage:timetable only.
// - TeacherWeekView: a teacher's own week, read-only. No shape switcher, no
//   class picker, no clear-timetable control, no other section's grid — just
//   the same TeacherWeek grid the admin "By teacher" view already uses,
//   pointed at the signed-in teacher's own lessons. See roles.ts's note on
//   manage:timetable, which this makes true.

import { CalendarRange, Clock, Eraser } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailPane } from "@/components/ui/detail-pane";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import {
  RegisterTabs,
  registerTabId,
  type RegisterTab,
} from "@/components/ui/register-tabs";
import { Segmented } from "@/components/ui/segmented";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { shortGrade } from "@/lib/registry/grade-label";
import type { DayShapeSummary } from "@/lib/timetable/day-shapes";
import { DAY_NAMES, cellAt, type BellPeriod } from "@/lib/timetable/schedule";
import type { Booking, SectionGrid } from "@/lib/timetable/grid";
import type { Clash, WeekPeriod } from "@/lib/timetable/teacher-week";
import { setCell, type ActionState } from "../timetable-actions";
import { ClearTimetableButton, WeekdayShapeBar } from "./day-shape-controls";
import { SchoolDayForm } from "./timetable-forms";
import {
  ClashBanner,
  FillMeter,
  TeacherWeek,
  WeekGrid,
  bookedTeachers,
  formatMinute,
  type CellAddress,
} from "./timetable-view";

const EMPTY: ActionState = {};

type SectionRow = { id: number; name: string; gradeName: string; filled: number };
type SubView = "week" | "teacher" | "day";

/// SectionGrid as it exists once a server component has serialised it for a
/// client one: periodsByDay crosses that boundary as a Record, not the Map
/// grid.ts computes it as (see the same treatment of lessonsByPeriod below).
type ClientSectionGrid = Omit<SectionGrid, "periodsByDay"> & {
  periodsByDay: Record<number, BellPeriod[]>;
};

/// What page.tsx hands the Timetable view, decided server-side from
/// canOpenTimetableView / timetableViewIsEditable (roles.ts) so the client
/// never has to re-derive who gets what:
/// - "unavailable": this actor cannot open the view at all (the tab itself is
///   hidden — see ClassesWorkspace).
/// - "no-year": the view is open, but there is no current academic year, so
///   there is nothing to build a grid or a week from yet.
/// - "edit": manage:timetable — the full grid, same as the old page.
/// - "readonly": a teacher's own week, nothing else.
export type TimetableSlot =
  | { state: "unavailable" }
  | { state: "no-year" }
  | ({ state: "edit" } & TimetableEditProps)
  | ({ state: "readonly" } & TimetableReadOnlyProps);

type TimetableEditProps = {
  yearLabel: string;
  academicYearId: number;
  dayShapeId: number;
  shapes: DayShapeSummary[];
  bell: BellPeriod[];
  workingDays: number[];
  sections: SectionRow[];
  selectedId: number | null;
  grid: ClientSectionGrid | null;
  clashes: Clash[];
  teachers: { id: number; fullName: string }[];
  selectedTeacherId: number | null;
  teacherWeek: WeekPeriod[];
  bookings: Booking[];
  lessonsByPeriod: Record<number, number>;
};

type TimetableReadOnlyProps = {
  bell: BellPeriod[];
  workingDays: number[];
  teacherWeek: WeekPeriod[];
};

export function TimetableEditView({
  yearLabel,
  academicYearId,
  dayShapeId,
  shapes,
  bell,
  workingDays,
  sections,
  selectedId,
  grid,
  clashes,
  teachers,
  selectedTeacherId,
  teacherWeek,
  bookings,
  lessonsByPeriod,
}: TimetableEditProps) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const router = useRouter();
  const params = useSearchParams();

  const reduce = useReducedMotion();
  const [view, setView] = useState<SubView>(bell.length === 0 ? "day" : "week");
  const [selectedCell, setSelectedCell] = useState<CellAddress | null>(null);
  const [room, setRoom] = useState("");
  /// The cell most recently written. The nonce makes a repeat write to the same
  /// cell replay the confirmation rather than sit there already faded.
  const [flash, setFlash] = useState<{ key: string; nonce: number } | null>(null);
  const [, cellAction] = useToastedActionState(setCell, EMPTY);

  /// Selection lives in the URL so the grid is server rendered and a link opens
  /// the class it names, matching ?student= and ?staff= elsewhere. Always
  /// keeps ?view=timetable, since this is a view inside Classes now, not a
  /// route of its own.
  function go(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    query.set("view", "timetable");
    for (const [key, value] of Object.entries(next)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    router.replace(`/dashboard/classes?${query.toString()}`, { scroll: false });
  }

  const tabs = useMemo<RegisterTab[]>(
    () =>
      sections.map((s) => ({
        id: String(s.id),
        code: `${shortGrade(s.gradeName)}${s.name}`,
        label: `${s.gradeName} ${s.name}`,
        count: s.filled,
        empty: s.filled === 0,
      })),
    [sections],
  );

  /// Where every teacher already is, excluding this section's own lessons —
  /// those are the cell being replaced, not a clash with itself.
  const elsewhere = useMemo(() => bookedTeachers(bookings), [bookings]);

  // Summed per day rather than teaching.length * workingDays.length: a day
  // running a shorter shape has fewer assignable slots, and the meter should
  // read that rather than a figure padded to the longest day of the week.
  // Neither a break nor an event is assignable, so both are excluded — only
  // TEACHING periods count towards the total.
  const totalSlots = workingDays.reduce((sum, day) => {
    const dayPeriods = grid?.periodsByDay[day] ?? [];
    return sum + dayPeriods.filter((p) => p.kind === "TEACHING").length;
  }, 0);
  const filledHere = grid?.cells.length ?? 0;

  function write(address: CellAddress, subjectOfferingId: string, nextRoom?: string) {
    if (selectedId === null) return;
    const data = new FormData();
    data.set("sectionId", String(selectedId));
    data.set("schoolPeriodId", String(address.schoolPeriodId));
    data.set("dayOfWeek", String(address.dayOfWeek));
    data.set("subjectOfferingId", subjectOfferingId);
    if (nextRoom !== undefined) data.set("room", nextRoom);
    setFlash((prev) => ({
      key: `${address.dayOfWeek}:${address.schoolPeriodId}`,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    startTransition(() => cellAction(data));
  }

  const current =
    selectedCell === null
      ? null
      : (grid?.cells.find(
          (c) =>
            c.dayOfWeek === selectedCell.dayOfWeek &&
            c.schoolPeriodId === selectedCell.schoolPeriodId,
        ) ?? null);

  const currentPeriod =
    selectedCell === null
      ? null
      : ((grid?.periodsByDay[selectedCell.dayOfWeek] ?? []).find(
          (p) => p.id === selectedCell.schoolPeriodId,
        ) ?? null);

  const aside =
    view !== "week" || selectedCell === null || currentPeriod === null ? undefined : (
      <DetailPane
        title={current ? current.subjectName : "Free period"}
        subtitle={`${DAY_NAMES[selectedCell.dayOfWeek]} · ${currentPeriod.name} · ${formatMinute(currentPeriod.startMinute)}–${formatMinute(currentPeriod.endMinute)}`}
        initials={current ? current.subjectName.slice(0, 2).toUpperCase() : "—"}
        actions={
          current ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => write(selectedCell, "")}
            >
              <Eraser data-icon="inline-start" aria-hidden="true" />
              Clear
            </Button>
          ) : undefined
        }
      >
        <DetailPane.Section label="Lesson">
          <DetailPane.Facts
            items={[
              { label: "Class", value: grid?.section.label ?? "—" },
              { label: "Teacher", value: current?.staffName ?? "—" },
            ]}
          />
        </DetailPane.Section>

        {current ? (
          <DetailPane.Section label="Room">
            <div className="flex gap-2">
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder={current.room || "Not recorded"}
                aria-label="Room"
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  write(selectedCell, String(current.subjectOfferingId), room)
                }
              >
                Save
              </Button>
            </div>
          </DetailPane.Section>
        ) : null}
      </DetailPane>
    );

  return (
    <>
      <PageFrame.Toolbar>
        <Segmented
          ariaLabel="Timetable view"
          value={view}
          onChange={setView}
          options={[
            { value: "week" as const, label: "Week" },
            { value: "teacher" as const, label: "By teacher" },
            { value: "day" as const, label: "School day", count: bell.length },
          ]}
        />
      </PageFrame.Toolbar>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        className="flex min-h-0 flex-1 flex-col"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
      {view === "day" ? (
        <PageFrame.Body>
          <SchoolDayForm
            shapes={shapes}
            dayShapeId={dayShapeId}
            onSelectShape={(id) => go({ shape: String(id) })}
            bell={bell}
            workingDays={workingDays}
            lessonsByPeriod={lessonsByPeriod}
          />
        </PageFrame.Body>
      ) : bell.length === 0 ? (
        <PageFrame.Body>
          <EmptyState
            icon={Clock}
            title="Set the school day first"
            description="A timetable is built from the school's periods, so those come before the grid."
            action={
              <Button type="button" size="sm" onClick={() => setView("day")}>
                Set the school day
              </Button>
            }
          />
        </PageFrame.Body>
      ) : view === "teacher" ? (
        <>
          <PageFrame.Toolbar>
            <FieldSelect
              value={selectedTeacherId === null ? "" : String(selectedTeacherId)}
              onValueChange={(next) => go({ teacher: next === "" ? null : next })}
              aria-label="Teacher"
              className="h-8 min-w-[220px]"
              options={[
                { value: "", label: "Pick a teacher" },
                ...teachers.map((t) => ({ value: String(t.id), label: t.fullName })),
              ]}
            />
            <ClashBanner clashes={clashes} />
            <span className="flex-1" />
            <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
              {teacherWeek.length} period{teacherWeek.length === 1 ? "" : "s"}
            </span>
          </PageFrame.Toolbar>
          <PageFrame.Body>
            {selectedTeacherId === null ? (
              <EmptyState
                icon={CalendarRange}
                title="Pick a teacher"
                description="Their week is built from the same lessons the class grids hold."
              />
            ) : (
              <TeacherWeek
                week={teacherWeek}
                workingDays={workingDays}
                bell={bell}
              />
            )}
          </PageFrame.Body>
        </>
      ) : sections.length === 0 ? (
        <PageFrame.Body>
          <EmptyState
            icon={CalendarRange}
            title="No sections this year"
            description="Add a section on the Structure view before building its week."
          />
        </PageFrame.Body>
      ) : (
        <>
          <PageFrame.Tabs>
            <RegisterTabs
              tabs={tabs}
              value={String(selectedId)}
              onChange={(id) => {
                setSelectedCell(null);
                go({ section: id });
              }}
              ariaLabel="Classes"
              baseId={baseId}
              panelId={panelId}
            />
          </PageFrame.Tabs>

          <PageFrame.Toolbar>
            <WeekdayShapeBar shapes={shapes} workingDays={workingDays} />
            <span className="flex-1" />
            <ClearTimetableButton
              sectionId={selectedId}
              sectionLabel={grid?.section.label ?? "This class"}
              academicYearId={academicYearId}
              yearLabel={yearLabel}
            />
          </PageFrame.Toolbar>

          <PageFrame.Toolbar>
            <ClashBanner clashes={clashes} />
            <span className="flex-1" />
            <FillMeter filled={filledHere} total={totalSlots} />
          </PageFrame.Toolbar>

          <PageFrame.Split
            aside={aside}
            asideTitle="Period"
            asideOpen={selectedCell !== null}
            onAsideClose={() => setSelectedCell(null)}
          >
            <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, String(selectedId))}>
              {grid ? (
                <WeekGrid
                  periodsByDay={grid.periodsByDay}
                  workingDays={workingDays}
                  cells={grid.cells}
                  options={grid.options}
                  sectionLabel={grid.section.label}
                  selected={selectedCell}
                  onSelect={(address) => {
                    setSelectedCell(address);
                    // Seed from the lesson already in that slot, not "": the
                    // room otherwise only ever showed as the input's
                    // placeholder, which reads as a value but Save never
                    // sent, wiping the room on an unedited save.
                    const cell = cellAt(grid?.cells ?? [], address);
                    setRoom(cell?.room ?? "");
                  }}
                  onChange={(address, value) => write(address, value)}
                  otherSectionBookings={elsewhere}
                  flash={flash}
                />
              ) : null}
            </PageFrame.Body>
          </PageFrame.Split>
        </>
      )}
      </motion.div>
      </AnimatePresence>
    </>
  );
}

/// A teacher's own week, read-only: no shape switcher, no teacher picker
/// (there is only ever one teacher to show), no clash banner (a diagnostic
/// for whoever builds the timetable, not for the teacher reading their own),
/// and no editing — TeacherWeek itself renders a plain table, nothing more.
export function TeacherWeekView({
  bell,
  workingDays,
  teacherWeek,
}: TimetableReadOnlyProps) {
  return (
    <>
      <PageFrame.Toolbar>
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          Your week · read-only
        </span>
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          {teacherWeek.length} period{teacherWeek.length === 1 ? "" : "s"}
        </span>
      </PageFrame.Toolbar>
      <PageFrame.Body>
        {bell.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="The school day is not set yet"
            description="Nothing is on the timetable until an administrator sets the school's periods."
          />
        ) : teacherWeek.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No lessons booked yet"
            description="Your week will show here once the timetable assigns you a class."
          />
        ) : (
          <TeacherWeek week={teacherWeek} workingDays={workingDays} bell={bell} />
        )}
      </PageFrame.Body>
    </>
  );
}
