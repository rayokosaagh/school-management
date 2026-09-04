"use client";

import { AlertTriangle, Eraser } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Callout } from "@/components/ui/page-shell";
import { Segmented } from "@/components/ui/segmented";
import { FieldSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { DayShapeSummary, OrphanedLessons } from "@/lib/timetable/day-shapes";
import { DAY_NAMES, describeClear, describeOrphanedLessons, shapeIdByDay } from "@/lib/timetable/schedule";
import type { ClearTimetableScope } from "@/lib/timetable/cells";
import { changeWeekdayShape, previewClearTimetable, previewWeekdayChange, runClearTimetable } from "../timetable-actions";

// The two destructive controls the timetable page's toolbar carries: which
// shape each weekday runs (spec section 4 — reassigning one can strand
// lessons), and clearing a class or year's whole timetable outright (spec
// section 6). Both preview what they would do and require confirmation
// before the write, in the same family as the year-delete dialog.

/// Sits above the grid. A compact FieldSelect per working day, so the
/// operator sees which shape today's grid is built from and can change it
/// without leaving the week view.
export function WeekdayShapeBar({
  shapes,
  workingDays,
}: {
  shapes: DayShapeSummary[];
  workingDays: number[];
}) {
  const byDay = shapeIdByDay(shapes);
  const [pending, setPending] = useState<{ dayOfWeek: number; dayShapeId: number } | null>(null);

  if (shapes.length <= 1) {
    // Nothing to switch between yet — the bar would just show one option,
    // seven times over, and say nothing.
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink-3 shrink-0 text-[11px] font-medium tracking-[0.1em] uppercase">
          Day shape
        </span>
        {workingDays.map((day) => (
          <label key={day} className="flex items-center gap-1">
            <span className="text-ink-3 text-[11px] font-medium">
              {DAY_NAMES[day].slice(0, 3)}
            </span>
            <FieldSelect
              value={String(byDay[day] ?? "")}
              onValueChange={(next) => {
                if (next === null || next === "") return;
                const id = Number(next);
                if (Number.isInteger(id) && id !== byDay[day]) {
                  setPending({ dayOfWeek: day, dayShapeId: id });
                }
              }}
              aria-label={`Day shape for ${DAY_NAMES[day]}`}
              className="h-7 w-auto min-w-[116px] text-[12.5px]"
              options={shapes.map((s) => ({ value: String(s.id), label: s.name }))}
            />
          </label>
        ))}
      </div>

      <WeekdayShapeDialog
        pending={pending}
        shapes={shapes}
        onClose={() => setPending(null)}
      />
    </>
  );
}

function WeekdayShapeDialog({
  pending,
  shapes,
  onClose,
}: {
  pending: { dayOfWeek: number; dayShapeId: number } | null;
  shapes: DayShapeSummary[];
  onClose: () => void;
}) {
  const push = useToast();
  const [preview, setPreview] = useState<OrphanedLessons | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();

  useEffect(() => {
    if (!pending) return;
    startLoad(async () => {
      setPreview(null);
      setError(null);
      const outcome = await previewWeekdayChange(pending.dayOfWeek, pending.dayShapeId);
      if (outcome.error) setError(outcome.error);
      else setPreview(outcome.orphaned ?? null);
    });
    // pending is a fresh object each time a select fires, which is exactly
    // when this should refetch — reducing to its two fields would refetch on
    // every render instead of only when the target actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.dayOfWeek, pending?.dayShapeId]);

  if (!pending) return null;

  const dayName = DAY_NAMES[pending.dayOfWeek];
  const targetShape = shapes.find((s) => s.id === pending.dayShapeId);

  function confirm() {
    if (!pending) return;
    startApply(async () => {
      const outcome = await changeWeekdayShape(pending.dayOfWeek, pending.dayShapeId);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      push("success", `${dayName} now runs ${targetShape?.name ?? "that shape"}.`);
      onClose();
    });
  }

  const destructive = (preview?.count ?? 0) > 0;

  return (
    <Modal open={pending !== null} title={`Change ${dayName}'s day shape`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-ink-3 text-sm">
          Switch {dayName} to <span className="text-ink font-medium">{targetShape?.name}</span>.
        </p>

        {loading ? (
          <p className="text-ink-3 text-sm">Checking for lessons this would strand…</p>
        ) : null}

        {preview ? (
          <Callout icon={AlertTriangle} tint={destructive ? "rose" : "green"}>
            <p>{describeOrphanedLessons(preview)}</p>
            {preview.sections.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px]">
                {preview.sections.map((s) => (
                  <li key={s.id}>
                    {s.gradeName} {s.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </Callout>
        ) : null}

        {error ? (
          <Callout icon={AlertTriangle} tint="rose">
            {error}
          </Callout>
        ) : null}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={loading || applying || preview === null}
            onClick={confirm}
          >
            {applying
              ? "Applying…"
              : destructive
                ? `Delete ${preview?.count} and switch`
                : "Switch"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/// Toolbar entry point for spec section 6: clears TimetablePeriod rows for the
/// class on screen, or the whole academic year, behind the same confirm
/// pattern as the weekday switch above.
export function ClearTimetableButton({
  sectionId,
  sectionLabel,
  academicYearId,
  yearLabel,
}: {
  sectionId: number | null;
  sectionLabel: string;
  academicYearId: number;
  yearLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={sectionId === null}
      >
        <Eraser data-icon="inline-start" aria-hidden="true" />
        Clear timetable
      </Button>
      <ClearTimetableDialog
        open={open}
        onClose={() => setOpen(false)}
        sectionId={sectionId}
        sectionLabel={sectionLabel}
        academicYearId={academicYearId}
        yearLabel={yearLabel}
      />
    </>
  );
}

function ClearTimetableDialog({
  open,
  onClose,
  sectionId,
  sectionLabel,
  academicYearId,
  yearLabel,
}: {
  open: boolean;
  onClose: () => void;
  sectionId: number | null;
  sectionLabel: string;
  academicYearId: number;
  yearLabel: string;
}) {
  const push = useToast();
  const [scope, setScope] = useState<"section" | "year">("section");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();

  const target: ClearTimetableScope | null =
    sectionId === null ? null : scope === "section" ? { sectionId } : { academicYearId };

  useEffect(() => {
    if (!open || target === null) return;
    startLoad(async () => {
      setCount(null);
      setError(null);
      const outcome = await previewClearTimetable(target);
      if (outcome.error) setError(outcome.error);
      else setCount(outcome.count ?? 0);
    });
    // Re-run whenever the scope choice or the dialog's open state changes;
    // `target` is a fresh object every render, so it cannot be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, sectionId, academicYearId]);

  // Reset to the narrower scope every time the dialog opens, so a stray
  // "Whole year" from a previous visit cannot linger as the default. Done
  // as a render-time state adjustment (React's documented escape hatch for
  // deriving state from a prop that just changed) rather than an effect, so
  // it commits in the same render as the open flip instead of a beat later.
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setScope("section");
  }

  if (sectionId === null) return null;

  const scopeLabel = scope === "section" ? sectionLabel : `every class in ${yearLabel}`;

  function confirm() {
    if (target === null) return;
    startApply(async () => {
      const outcome = await runClearTimetable(target);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      const deleted = outcome.deleted ?? 0;
      push("success", `${deleted} lesson${deleted === 1 ? "" : "s"} cleared.`);
      onClose();
    });
  }

  return (
    <Modal open={open} title="Clear timetable" onClose={onClose}>
      <div className="space-y-4">
        <Segmented
          ariaLabel="Scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "section" as const, label: sectionLabel },
            { value: "year" as const, label: "Whole year" },
          ]}
        />

        {loading ? <p className="text-ink-3 text-sm">Counting…</p> : null}

        {count !== null ? (
          <Callout icon={AlertTriangle} tint={count > 0 ? "rose" : "green"}>
            {describeClear(count, scopeLabel)}
          </Callout>
        ) : null}

        {error ? (
          <Callout icon={AlertTriangle} tint="rose">
            {error}
          </Callout>
        ) : null}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            type="button"
            variant="destructive"
            disabled={loading || applying || !count}
            onClick={confirm}
          >
            {applying ? "Clearing…" : `Clear ${count ?? 0} lesson${count === 1 ? "" : "s"}`}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
