"use client";

import { AlertTriangle, CalendarDays, Coffee, Info, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { FieldSelect } from "@/components/ui/select";
import {
  DAY_NAMES,
  buildDayColumn,
  formatMinute,
  periodIsCurrent,
  periodProgress,
  schoolTime,
  type BellPeriod,
} from "@/lib/timetable/schedule";
import type { Booking, GridCell, GridOption } from "@/lib/timetable/grid";
import type { Clash, WeekPeriod } from "@/lib/timetable/teacher-week";
import { cn } from "@/lib/utils";

export { formatMinute };

const CLEAR = "";

/// Which teacher is booked where, keyed by day and period. Built once per
/// render so a cell can answer "is this subject's teacher already busy?"
/// without walking the whole school's week for every option it draws.
export function bookedTeachers(bookings: Booking[]) {
  const map = new Map<string, Map<number, string>>();
  for (const booking of bookings) {
    const key = `${booking.dayOfWeek}:${booking.schoolPeriodId}`;
    const slot = map.get(key) ?? new Map<number, string>();
    slot.set(booking.staffId, booking.where);
    map.set(key, slot);
  }
  return map;
}

/// The school's own clock, ticking. Null until after mount: the server has no
/// business rendering "now", and a server-rendered minute would be wrong by the
/// time it reached the browser anyway.
export function useSchoolNow(everyMs = 30_000) {
  const [now, setNow] = useState<{ dayOfWeek: number; minuteOfDay: number } | null>(
    null,
  );

  useEffect(() => {
    const read = () => setNow(schoolTime(new Date()));
    read();
    const timer = setInterval(read, everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);

  return now;
}

export type CellAddress = { dayOfWeek: number; schoolPeriodId: number };

/// The week as columns, one per working day, each holding only the periods
/// its own shape carries — not a shared row set (see day-shapes-design.md
/// section 5: an HTML table cannot vary its row count per column, which is
/// exactly why a day running a narrower shape used to render an inert cell
/// instead of simply ending). A short day's column is just shorter.
///
/// A lesson cell rests as a subject chip and only shows its select furniture
/// on hover or focus. The control underneath is still a real select, so
/// nothing is lost for the keyboard or a screen reader; only the resting skin
/// changes, because a timetable is read far more often than it is edited.
export function WeekGrid({
  periodsByDay,
  workingDays,
  cells,
  options,
  sectionLabel,
  selected,
  onSelect,
  onChange,
  otherSectionBookings,
  flash,
}: {
  /// Each working day's own periods (see SectionGrid.periodsByDay), resolved
  /// through the shape it runs. A day on a narrower shape simply carries
  /// fewer entries here — nothing pads it back out to match a longer day.
  periodsByDay: Record<number, BellPeriod[]>;
  workingDays: number[];
  cells: GridCell[];
  options: GridOption[];
  sectionLabel: string;
  selected: CellAddress | null;
  onSelect: (address: CellAddress | null) => void;
  onChange: (address: CellAddress, subjectOfferingId: string) => void;
  /// staffId -> where they already are, for every slot outside this section.
  otherSectionBookings: Map<string, Map<number, string>>;
  /// The cell most recently written, and a nonce so a repeat write replays.
  flash: { key: string; nonce: number } | null;
}) {
  const reduce = useReducedMotion();
  const now = useSchoolNow();

  const cellsByDay = new Map<number, GridCell[]>();
  for (const cell of cells) {
    const list = cellsByDay.get(cell.dayOfWeek);
    if (list) list.push(cell);
    else cellsByDay.set(cell.dayOfWeek, [cell]);
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      role="table"
      aria-label={`Weekly timetable for ${sectionLabel}`}
    >
      {/* Keyed on the class, so switching tabs replays the stagger and the
          week reads as a new document rather than swapped text. */}
      <div
        key={sectionLabel}
        role="rowgroup"
        className="grid items-start gap-px bg-line"
        style={{ gridTemplateColumns: `repeat(${workingDays.length}, minmax(168px, 1fr))` }}
      >
        {workingDays.map((day) => {
          const today = now?.dayOfWeek === day;
          // Each day's own column, from its own shape's periods only — the
          // exact boundary buildDayColumn keeps pure and unit tested.
          const column = buildDayColumn(periodsByDay[day] ?? [], cellsByDay.get(day) ?? []);

          return (
            <div key={day} role="row" className="bg-surface flex min-w-0 flex-col">
              <div
                role="rowheader"
                className={cn(
                  "bg-surface-2 border-line sticky top-0 z-10 border-b px-3 py-2 text-left font-medium",
                  today && "text-brand-text",
                )}
              >
                {DAY_NAMES[day]}
                {/* Colour is never the only signal, so today says so. */}
                {today ? (
                  <span className="text-brand-text ml-1.5 text-[11px] font-normal">today</span>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-1">
                {column.length === 0 ? (
                  <p className="text-ink-3 px-2 py-3 text-[12px]">No periods today.</p>
                ) : null}

                {column.map(({ period, cell }, rowIndex) => {
                  const isNow = now !== null && today && periodIsCurrent(period, now.minuteOfDay);

                  const rise = reduce
                    ? {}
                    : {
                        initial: { opacity: 0, y: 4 },
                        animate: { opacity: 1, y: 0 },
                        transition: {
                          duration: 0.28,
                          ease: [0.2, 0.8, 0.2, 1] as const,
                          // Capped so a long day does not become a slow reveal.
                          delay: Math.min(rowIndex, 12) * 0.02,
                        },
                      };

                  if (period.kind === "BREAK") {
                    return (
                      <motion.div
                        key={period.id}
                        role="cell"
                        {...rise}
                        className="border-line bg-surface-2/60 text-ink-3 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px]"
                      >
                        <Coffee className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{period.name}</span>
                        <span className="font-mono text-[10.5px] tabular-nums">
                          {formatMinute(period.startMinute)}
                        </span>
                      </motion.div>
                    );
                  }

                  // An event carries no teacher or subject and is not part of
                  // the assignable grid — a labelled band, distinct from both
                  // a lesson and a break, and nothing here is clickable.
                  if (period.kind === "EVENT") {
                    return (
                      <motion.div
                        key={period.id}
                        role="cell"
                        {...rise}
                        className="border-brand-tint-2 bg-brand-tint text-brand-text flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] font-medium"
                      >
                        <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          {period.label || period.name}
                        </span>
                        <span className="font-mono text-[10.5px] font-normal tabular-nums">
                          {formatMinute(period.startMinute)}
                        </span>
                      </motion.div>
                    );
                  }

                  const key = `${day}:${period.id}`;
                  const busy = otherSectionBookings.get(key) ?? new Map();
                  const isSelected =
                    selected?.dayOfWeek === day && selected?.schoolPeriodId === period.id;
                  const tone = cell ? cell.tone : null;

                  return (
                    <motion.div
                      key={period.id}
                      role="cell"
                      {...rise}
                      className={cn(
                        "border-line relative rounded-lg border p-1.5",
                        today && "bg-brand-tint/25",
                        isSelected && "bg-brand-tint",
                      )}
                    >
                      <div className="text-ink-3 mb-1 flex items-center gap-1.5 text-[10.5px]">
                        <span className="text-ink font-medium">{period.name}</span>
                        {isNow ? (
                          <span className="bg-brand text-brand-ink rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase">
                            Now
                          </span>
                        ) : null}
                        <span className="ml-auto font-mono tabular-nums">
                          {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
                        </span>
                      </div>

                      <div className="group/cell relative">
                        {/* The subject's own colour, carried across every class
                            it is taught in. A 3px rule, not a fill: the grid
                            keeps one accent, and this stays a code. */}
                        {tone !== null ? (
                          <span
                            aria-hidden="true"
                            className="absolute top-1 bottom-1 left-0 z-10 w-[3px] rounded-full"
                            style={{ background: `var(--subject-${tone})` }}
                          />
                        ) : null}

                        <FieldSelect
                          value={cell ? String(cell.subjectOfferingId) : CLEAR}
                          onValueChange={(next) =>
                            // A cleared select and the "free" option mean the
                            // same thing, so both take the empty-string path.
                            onChange(
                              { dayOfWeek: day, schoolPeriodId: period.id },
                              next ?? CLEAR,
                            )
                          }
                          aria-label={`${DAY_NAMES[day]}, ${period.name}, ${sectionLabel}`}
                          className={cn(
                            // dark:bg-input/30 rides on the shared trigger, and
                            // outranks a plain bg-transparent, so the dark
                            // resting state has to be turned off by name.
                            "h-8 w-full rounded-lg border-transparent bg-transparent shadow-none transition-colors dark:bg-transparent",
                            "group-hover/cell:border-line group-hover/cell:bg-surface group-hover/cell:dark:bg-surface",
                            "data-[popup-open]:border-line data-[popup-open]:bg-surface data-[popup-open]:dark:bg-surface",
                            // The chevron is furniture; it earns its space only
                            // when the cell is actually being worked on.
                            "[&_svg]:opacity-0 [&_svg]:transition-opacity",
                            "group-hover/cell:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100 data-[popup-open]:[&_svg]:opacity-100",
                            cell ? "pl-3 font-medium" : "text-ink-3 pl-3",
                          )}
                          placeholder="—"
                          options={[
                            { value: CLEAR, label: "— free —" },
                            ...options.map((option) => {
                              const elsewhere =
                                option.staffId === null
                                  ? null
                                  : (busy.get(option.staffId) ?? null);
                              const mine =
                                cell?.subjectOfferingId === option.subjectOfferingId;

                              // The reason rides in the label: a disabled option
                              // on its own tells a screen reader nothing.
                              if (option.staffId === null) {
                                return {
                                  value: String(option.subjectOfferingId),
                                  label: `${option.subjectName} — no teacher yet`,
                                  disabled: true,
                                };
                              }
                              if (elsewhere && !mine) {
                                return {
                                  value: String(option.subjectOfferingId),
                                  label: `${option.subjectName} — ${option.staffName} is in ${elsewhere}`,
                                  disabled: true,
                                };
                              }
                              return {
                                value: String(option.subjectOfferingId),
                                label: option.subjectName,
                              };
                            }),
                          ]}
                        />

                        {cell ? (
                          <p className="text-ink-3 mt-0.5 truncate pl-3 text-[11.5px]">
                            {cell.staffName}
                            {cell.room ? ` · ${cell.room}` : ""}
                          </p>
                        ) : (
                          /* An empty slot reads as a gap in the week, not as a
                             control waiting to be filled. */
                          <span
                            aria-hidden="true"
                            className="text-ink-3 pointer-events-none absolute inset-x-1 top-1.5 flex h-5 items-center gap-1 opacity-0 transition-opacity group-hover/cell:opacity-60"
                          >
                            <Plus className="size-3" />
                          </span>
                        )}

                        {/* Opens the pane. A real button rather than the cell's
                            focus, so tabbing into a select — or opening one on a
                            phone — cannot slide a Sheet out underneath it. */}
                        <button
                          type="button"
                          onClick={() =>
                            onSelect(
                              isSelected ? null : { dayOfWeek: day, schoolPeriodId: period.id },
                            )
                          }
                          aria-label={`Details for ${DAY_NAMES[day]}, ${period.name}`}
                          aria-pressed={isSelected}
                          className={cn(
                            "border-line bg-surface text-ink-3 hover:text-ink focus-visible:ring-ring/50 absolute -top-0.5 right-0 z-20 grid size-5 place-items-center rounded-md border opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none",
                            "group-hover/cell:opacity-100",
                            isSelected && "opacity-100",
                          )}
                        >
                          <Info className="size-3" aria-hidden="true" />
                        </button>

                        {/* Confirms the write where the eye already is, so the
                            toast is a record rather than the only feedback. */}
                        {flash?.key === key && !reduce ? (
                          <motion.span
                            key={flash.nonce}
                            aria-hidden="true"
                            initial={{ opacity: 0.5 }}
                            animate={{ opacity: 0 }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className="bg-brand pointer-events-none absolute inset-0 rounded-lg"
                          />
                        ) : null}
                      </div>

                      {/* How far through the lesson the school actually is. */}
                      {today && isNow && now ? (
                        <motion.span
                          aria-hidden="true"
                          className="bg-brand absolute bottom-0 left-0 h-[2px]"
                          initial={false}
                          animate={{
                            width: `${periodProgress(period, now.minuteOfDay) * 100}%`,
                          }}
                          transition={
                            reduce ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }
                          }
                        />
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/// One teacher's week, read-only. The same rows the grid writes, seen down the
/// other axis.
export function TeacherWeek({
  week,
  workingDays,
  bell,
}: {
  week: WeekPeriod[];
  workingDays: number[];
  bell: BellPeriod[];
}) {
  const reduce = useReducedMotion();
  const now = useSchoolNow();
  const bySlot = new Map(week.map((p) => [`${p.dayOfWeek}:${p.schoolPeriodId}`, p]));
  const teaching = bell.filter((period) => period.kind !== "BREAK");

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table
        role="grid"
        aria-label="Teacher's week"
        className="w-full border-separate border-spacing-0 text-[13px]"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-surface-2 border-line text-ink-3 sticky top-0 left-0 z-20 w-[100px] border-r border-b px-3 py-2 text-left text-[11px] font-medium tracking-[0.1em] uppercase"
            >
              Period
            </th>
            {workingDays.map((day) => (
              <th
                key={day}
                scope="col"
                className={cn(
                  "bg-surface-2 border-line sticky top-0 z-10 border-b px-3 py-2 text-left font-medium",
                  now?.dayOfWeek === day && "text-brand-text",
                )}
              >
                {DAY_NAMES[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teaching.map((period, rowIndex) => {
            const isNow = now !== null && periodIsCurrent(period, now.minuteOfDay);
            return (
              <motion.tr
                key={period.id}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  ease: [0.2, 0.8, 0.2, 1],
                  delay: Math.min(rowIndex, 12) * 0.02,
                }}
              >
                <th
                  scope="row"
                  className={cn(
                    "bg-surface-2 border-line sticky left-0 z-10 border-r border-b px-3 py-2 text-left align-top font-medium",
                    isNow && "bg-brand-tint",
                  )}
                >
                  <span className="block">{period.name}</span>
                  <span className="text-ink-3 block font-mono text-[11px] tabular-nums">
                    {formatMinute(period.startMinute)}
                  </span>
                </th>
                {workingDays.map((day) => {
                  const lesson = bySlot.get(`${day}:${period.id}`);
                  const tone = lesson ? lesson.tone : null;
                  return (
                    <td
                      key={day}
                      className={cn(
                        "border-line relative border-b py-2 pr-3 pl-4 align-top",
                        now?.dayOfWeek === day && "bg-brand-tint/35",
                      )}
                    >
                      {lesson ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute top-2 bottom-2 left-1 w-[3px] rounded-full"
                            style={{ background: `var(--subject-${tone})` }}
                          />
                          <span className="block font-medium">{lesson.subject}</span>
                          <span className="text-ink-3 block text-[11.5px]">
                            {lesson.classSection}
                            {lesson.room ? ` · ${lesson.room}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  );
                })}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/// Clashes cannot be created through the grid, but changing who teaches a
/// subject on the Teaching page can leave one behind. Reported, never silent —
/// and never by colour alone.
export function ClashBanner({ clashes }: { clashes: Clash[] }) {
  if (clashes.length === 0) return null;

  return (
    <div
      role="status"
      className="border-warn/40 bg-warn-tint text-ink flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]"
    >
      <AlertTriangle className="text-warn size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        <span className="font-medium">
          {clashes.length} clash{clashes.length === 1 ? "" : "es"}
        </span>
        {" · "}
        {clashes[0].staffName} is in{" "}
        {clashes[0].sections.map((s) => s.label).join(" and ")} during{" "}
        {clashes[0].periodName}
        {clashes.length > 1 ? ", and others" : ""}
      </span>
    </div>
  );
}

/// Filled against total, as a rule rather than a sentence. It moves as cells
/// are filled, which is the one number a timetabler is actually tracking.
export function FillMeter({ filled, total }: { filled: number; total: number }) {
  const reduce = useReducedMotion();
  const share = total === 0 ? 0 : filled / total;

  return (
    <div className="flex min-w-[136px] shrink-0 items-center gap-2">
      <span className="text-ink-3 font-mono text-[11.5px] tabular-nums">
        {filled}/{total}
      </span>
      <span
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Periods filled"
        className="bg-surface-2 border-line h-[6px] flex-1 overflow-hidden rounded-full border"
      >
        <motion.span
          className={cn("block h-full rounded-full", share === 1 ? "bg-ok" : "bg-brand")}
          initial={false}
          animate={{ width: `${share * 100}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </span>
    </div>
  );
}
