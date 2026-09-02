"use client";

import { Coffee, Plus, Trash2 } from "lucide-react";
import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastedActionState } from "@/components/ui/toast";
import { DAY_NAMES, DEFAULT_BELL, type BellPeriod } from "@/lib/timetable/schedule";
import { saveBell, saveDays, type ActionState } from "../actions";

const EMPTY: ActionState = {};

type Row = {
  id?: number;
  order: number;
  name: string;
  startMinute: number;
  endMinute: number;
  isBreak: boolean;
};

function toTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function fromTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

/// The bell schedule and the working week. Both live here rather than in
/// Settings, so the whole feature sits behind one capability: an Office user who
/// may build the timetable can define the day it is built on.
export function SchoolDayForm({
  bell,
  workingDays,
  lessonsByPeriod,
}: {
  bell: BellPeriod[];
  workingDays: number[];
  lessonsByPeriod: Record<number, number>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    bell.length > 0 ? bell.map((p) => ({ ...p })) : DEFAULT_BELL.map((p) => ({ ...p })),
  );
  const [days, setDays] = useState<number[]>(workingDays);
  const [, bellAction, bellPending] = useToastedActionState(saveBell, EMPTY);
  const [, daysAction] = useToastedActionState(saveDays, EMPTY);

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

  function add(isBreak: boolean) {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const start = last ? last.endMinute : 600;
      return [
        ...prev,
        {
          order: prev.length,
          name: isBreak ? "Break" : `Period ${prev.filter((r) => !r.isBreak).length + 1}`,
          startMinute: start,
          endMinute: Math.min(start + (isBreak ? 30 : 45), 1440),
          isBreak,
        },
      ];
    });
  }

  function submitBell() {
    const data = new FormData();
    data.set("rows", JSON.stringify(rows.map((row, i) => ({ ...row, order: i }))));
    startTransition(() => bellAction(data));
  }

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
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-2xl space-y-8">
        <section>
          <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">
            Working days
          </h2>
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
          <p className="text-ink-3 mt-2 text-[12.5px]">
            Saturday is the weekly holiday in Nepal, so it is off by default.
          </p>
        </section>

        <section>
          <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">
            The school day
          </h2>

          <ul className="space-y-1.5">
            {rows.map((row, i) => (
              <li
                key={row.id ?? `new-${i}`}
                className="border-line bg-surface flex items-center gap-2 rounded-lg border p-2"
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
                <button
                  type="button"
                  aria-pressed={row.isBreak}
                  aria-label={`${row.name} is a break`}
                  title="Mark as a break"
                  onClick={() => edit(i, { isBreak: !row.isBreak })}
                  className={
                    row.isBreak
                      ? "bg-brand-tint text-brand-text border-brand-tint-2 grid size-8 shrink-0 place-items-center rounded-lg border"
                      : "border-line text-ink-3 hover:text-ink grid size-8 shrink-0 place-items-center rounded-lg border"
                  }
                >
                  <Coffee className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${row.name}`}
                  className="border-line text-ink-3 hover:text-bad grid size-8 shrink-0 place-items-center rounded-lg border"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => add(false)}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add period
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => add(true)}>
              <Coffee data-icon="inline-start" aria-hidden="true" />
              Add break
            </Button>
            <span className="flex-1" />
            <Button type="button" size="sm" onClick={submitBell} disabled={bellPending}>
              {bellPending ? "Saving…" : "Save school day"}
            </Button>
          </div>

          <p className="text-ink-3 mt-2 text-[12.5px]">
            Times move every lesson in that period with them. Removing a period
            deletes the lessons scheduled in it.
          </p>
        </section>
      </div>
    </div>
  );
}
