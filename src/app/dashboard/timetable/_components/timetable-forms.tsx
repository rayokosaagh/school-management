"use client";

import { Coffee, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import type { DayShapeSummary } from "@/lib/timetable/day-shapes";
import {
  DAY_NAMES,
  DEFAULT_BELL,
  type BellPeriod,
  type PeriodKind,
} from "@/lib/timetable/schedule";
import {
  createShape,
  deleteShapeAction,
  renameShape,
  saveBell,
  saveDays,
  type ActionState,
} from "../actions";

const EMPTY: ActionState = {};

const KIND_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: "TEACHING", label: "Teaching" },
  { value: "BREAK", label: "Break" },
  { value: "EVENT", label: "Event" },
];

type Row = {
  id?: number;
  order: number;
  name: string;
  startMinute: number;
  endMinute: number;
  kind: PeriodKind;
  /// Only ever non-empty for an EVENT row — validateBell refuses the two
  /// states disagreeing, and the kind select below clears this the moment a
  /// row stops being an event.
  label: string;
};

function toTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function fromTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

/// The whole "School day" tab: which shapes exist and which is being edited,
/// the working week, and that shape's own bell schedule. One component
/// rather than three, because creating a shape immediately wants its bell
/// schedule on screen.
export function SchoolDayForm({
  shapes,
  dayShapeId,
  onSelectShape,
  bell,
  workingDays,
  lessonsByPeriod,
}: {
  shapes: DayShapeSummary[];
  /// The shape being edited. Comes from the URL (see page.tsx's ?shape=), so
  /// a link can open straight onto one shape's schedule.
  dayShapeId: number;
  onSelectShape: (id: number) => void;
  bell: BellPeriod[];
  workingDays: number[];
  lessonsByPeriod: Record<number, number>;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-2xl space-y-8">
        <ShapeSection shapes={shapes} dayShapeId={dayShapeId} onSelectShape={onSelectShape} />

        <section>
          <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">
            Working days
          </h2>
          <WorkingDaysEditor workingDays={workingDays} />
          <p className="text-ink-3 mt-2 text-[12.5px]">
            Saturday is the weekly holiday in Nepal, so it is off by default.
          </p>
        </section>

        <BellEditor
          key={dayShapeId}
          dayShapeId={dayShapeId}
          bell={bell}
          lessonsByPeriod={lessonsByPeriod}
        />
      </div>
    </div>
  );
}

/// Which shapes exist, which one the bell editor below is showing, and the
/// create / rename / delete controls for the set of shapes itself.
function ShapeSection({
  shapes,
  dayShapeId,
  onSelectShape,
}: {
  shapes: DayShapeSummary[];
  dayShapeId: number;
  onSelectShape: (id: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const [createState, createAction, createPending] = useToastedActionState(createShape, EMPTY);
  const [, renameAction, renamePending] = useToastedActionState(renameShape, EMPTY);
  const [, deleteAction] = useToastedActionState(deleteShapeAction, EMPTY);

  // Adopts the shape a create just made, the same "trust what the server
  // handed back" mechanism the bell rows below use — a newly made shape has
  // no id anywhere on the client until this fires.
  const [seenCreate, setSeenCreate] = useState(createState);
  if (createState !== seenCreate) {
    setSeenCreate(createState);
    if (createState.shapeId !== undefined) {
      onSelectShape(createState.shapeId);
      setCreating(false);
      setName("");
      setCopyFromId("");
    }
  }

  const selected = shapes.find((s) => s.id === dayShapeId) ?? shapes[0];

  function submitCreate() {
    const data = new FormData();
    data.set("name", name);
    if (copyFromId) data.set("copyFromId", copyFromId);
    startTransition(() => createAction(data));
  }

  function submitRename() {
    if (!selected) return;
    const data = new FormData();
    data.set("dayShapeId", String(selected.id));
    data.set("name", renameValue);
    startTransition(() => renameAction(data));
    setRenaming(false);
  }

  function remove(shape: DayShapeSummary) {
    if (shape.isDefault) return;
    if (
      !window.confirm(
        `Delete the "${shape.name}" day shape? This only works while no weekday runs it.`,
      )
    ) {
      return;
    }
    // No local switch-away here: if this shape was the one selected, page.tsx
    // resolves ?shape= against the fresh shape list on revalidate and falls
    // back to the default itself the moment this id no longer resolves —
    // switching optimistically would abandon the shape before knowing
    // whether the delete was actually allowed to happen.
    const data = new FormData();
    data.set("dayShapeId", String(shape.id));
    startTransition(() => deleteAction(data));
  }

  return (
    <section>
      <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">
        Day shapes
      </h2>

      <div className="flex flex-wrap items-center gap-1.5">
        {shapes.map((shape) => {
          const active = shape.id === dayShapeId;
          return (
            <button
              key={shape.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectShape(shape.id)}
              className={
                active
                  ? "bg-brand-tint text-brand-text border-brand-tint-2 h-8 rounded-lg border px-3 text-[13px] font-medium"
                  : "border-line text-ink-3 hover:text-ink h-8 rounded-lg border px-3 text-[13px]"
              }
            >
              {shape.name}
              {shape.isDefault ? (
                <span className="text-ink-3 ml-1.5 text-[11px] font-normal">default</span>
              ) : null}
            </button>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setCreating((v) => !v);
            setRenaming(false);
          }}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          New shape
        </Button>

        {selected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRenameValue(selected.name);
              setRenaming((v) => !v);
              setCreating(false);
            }}
          >
            <Pencil data-icon="inline-start" aria-hidden="true" />
            Rename
          </Button>
        ) : null}

        {selected && !selected.isDefault ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => remove(selected)}
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="border-line bg-surface mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Half day"
            aria-label="New shape name"
            className="h-8 min-w-0 flex-1"
          />
          <FieldSelect
            value={copyFromId}
            onValueChange={(next) => setCopyFromId(next ?? "")}
            aria-label="Copy periods from"
            className="h-8 w-[200px]"
            placeholder="Start blank"
            options={[
              { value: "", label: "Start blank" },
              ...shapes.map((s) => ({ value: String(s.id), label: `Copy from ${s.name}` })),
            ]}
          />
          <Button
            type="button"
            size="sm"
            onClick={submitCreate}
            disabled={createPending || name.trim() === ""}
          >
            {createPending ? "Creating…" : "Create"}
          </Button>
        </div>
      ) : null}

      {renaming && selected ? (
        <div className="border-line bg-surface mt-2.5 flex items-center gap-2 rounded-lg border p-2.5">
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            aria-label="Rename shape"
            className="h-8 min-w-0 flex-1"
          />
          <Button
            type="button"
            size="sm"
            onClick={submitRename}
            disabled={renamePending || renameValue.trim() === ""}
          >
            Save
          </Button>
        </div>
      ) : null}

      <p className="text-ink-3 mt-2 text-[12.5px]">
        A shape can only be deleted while no weekday runs it, and the default
        shape can never be deleted — every day falls back to it.
      </p>
    </section>
  );
}

function WorkingDaysEditor({ workingDays }: { workingDays: number[] }) {
  const [days, setDays] = useState<number[]>(workingDays);
  const [, daysAction] = useToastedActionState(saveDays, EMPTY);

  function toggleDay(day: number) {
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    setDays(next);
    const data = new FormData();
    for (const d of next) data.append("day", String(d));
    startTransition(() => daysAction(data));
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_NAMES.map((name, day) => {
        const on = days.includes(day);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => toggleDay(day)}
            className={
              on
                ? "bg-brand-tint text-brand-text border-brand-tint-2 h-8 rounded-lg border px-3 text-[13px] font-medium"
                : "border-line text-ink-3 hover:text-ink h-8 rounded-lg border px-3 text-[13px]"
            }
          >
            {name.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

/// One shape's bell schedule: add a period, set its kind, and — for an event
/// — its label. Kept keyed by dayShapeId in the parent, so switching shapes
/// remounts this rather than carrying one shape's unsaved edits onto another.
function BellEditor({
  dayShapeId,
  bell,
  lessonsByPeriod,
}: {
  dayShapeId: number;
  bell: BellPeriod[];
  lessonsByPeriod: Record<number, number>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    bell.length > 0 ? bell.map((p) => ({ ...p })) : DEFAULT_BELL.map((p) => ({ ...p })),
  );
  const [bellState, bellAction, bellPending] = useToastedActionState(saveBell, EMPTY);

  // The server is the only place ids are assigned. Adopting its rows the
  // instant a save resolves — rather than trusting local state, or the `bell`
  // prop that only updates through a revalidate a beat later — is what stops
  // a second save in the same visit from re-sending id: undefined for a row
  // the first save already created, which would delete and recreate it,
  // cascading away every lesson booked in that slot.
  //
  // This adjusts state during render (React's documented escape hatch for
  // "derive state from a prop/value that just changed") rather than in a
  // useEffect, so the adoption is not a second, separately-committed render.
  // `seenBellState` only tracks the state's own identity, which changes once
  // per completed save and never as a side effect of setRows below, so this
  // cannot loop.
  const [seenBellState, setSeenBellState] = useState(bellState);
  if (bellState !== seenBellState) {
    setSeenBellState(bellState);
    if (bellState.rows) setRows(bellState.rows.map((row) => ({ ...row })));
  }

  function edit(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    const row = rows[index];
    const lessons = row.id === undefined ? 0 : (lessonsByPeriod[row.id] ?? 0);
    // Deleting a bell period cascades to its lessons. Never a surprise.
    if (
      lessons > 0 &&
      !window.confirm(
        `Removing ${row.name} will delete ${lessons} scheduled lesson${lessons === 1 ? "" : "s"}. Continue?`,
      )
    ) {
      return;
    }
    setRows((prev) =>
      prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, order: i })),
    );
  }

  function add(kind: PeriodKind) {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const start = last ? last.endMinute : 600;
      const teachingCount = prev.filter((r) => r.kind === "TEACHING").length;
      return [
        ...prev,
        {
          order: prev.length,
          name:
            kind === "BREAK" ? "Break" : kind === "EVENT" ? "Event" : `Period ${teachingCount + 1}`,
          startMinute: start,
          endMinute: Math.min(start + (kind === "TEACHING" ? 45 : 30), 1440),
          kind,
          label: kind === "EVENT" ? "Event" : "",
        },
      ];
    });
  }

  function submitBell() {
    const data = new FormData();
    data.set("dayShapeId", String(dayShapeId));
    data.set("rows", JSON.stringify(rows.map((row, i) => ({ ...row, order: i }))));
    startTransition(() => bellAction(data));
  }

  return (
    <section>
      <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">
        The school day
      </h2>

      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li
            key={row.id ?? `new-${i}`}
            className="border-line bg-surface flex flex-wrap items-center gap-2 rounded-lg border p-2"
          >
            <span className="text-ink-3 w-6 shrink-0 text-center font-mono text-[11px] tabular-nums">
              {i + 1}
            </span>
            <Input
              value={row.name}
              onChange={(e) => edit(i, { name: e.target.value })}
              aria-label={`Name of period ${i + 1}`}
              className="h-8 min-w-0 flex-1"
            />
            <Input
              type="time"
              value={toTime(row.startMinute)}
              onChange={(e) => {
                const next = fromTime(e.target.value);
                if (next !== null) edit(i, { startMinute: next });
              }}
              aria-label={`Start of period ${i + 1}`}
              className="h-8 w-[104px] shrink-0 font-mono tabular-nums"
            />
            <Input
              type="time"
              value={toTime(row.endMinute)}
              onChange={(e) => {
                const next = fromTime(e.target.value);
                if (next !== null) edit(i, { endMinute: next });
              }}
              aria-label={`End of period ${i + 1}`}
              className="h-8 w-[104px] shrink-0 font-mono tabular-nums"
            />
            <FieldSelect
              value={row.kind}
              onValueChange={(next) => {
                const kind = (next as PeriodKind | null) ?? "TEACHING";
                // An event needs a label and the other two kinds must not
                // carry one — validateBell enforces this too, but clearing it
                // here means switching a row away from EVENT never leaves a
                // save to fail on a rule the form could have satisfied itself.
                edit(i, { kind, label: kind === "EVENT" ? row.label || row.name : "" });
              }}
              aria-label={`Kind of period ${i + 1}`}
              className="h-8 w-[112px] shrink-0"
              options={KIND_OPTIONS}
            />
            {row.kind === "EVENT" ? (
              <Input
                value={row.label}
                onChange={(e) => edit(i, { label: e.target.value })}
                placeholder="Label shown in the grid"
                aria-label={`Label for period ${i + 1}`}
                className="h-8 w-[168px] shrink-0"
              />
            ) : null}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${row.name}`}
              className="border-line text-ink-3 hover:text-bad ml-auto grid size-8 shrink-0 place-items-center rounded-lg border"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => add("TEACHING")}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          Add period
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add("BREAK")}>
          <Coffee data-icon="inline-start" aria-hidden="true" />
          Add break
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add("EVENT")}>
          <Megaphone data-icon="inline-start" aria-hidden="true" />
          Add event
        </Button>
        <span className="flex-1" />
        <Button type="button" size="sm" onClick={submitBell} disabled={bellPending}>
          {bellPending ? "Saving…" : "Save school day"}
        </Button>
      </div>

      <p className="text-ink-3 mt-2 text-[12.5px]">
        Times move every lesson in that period with them. Removing a period
        deletes the lessons scheduled in it. An event takes no teacher or
        subject — its label is what shows in the grid.
      </p>
    </section>
  );
}
