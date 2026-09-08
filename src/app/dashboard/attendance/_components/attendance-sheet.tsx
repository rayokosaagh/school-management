"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Fragment, useState } from "react";
import { Check, CircleSlash, Clock, Plane } from "lucide-react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type ActionState, saveAttendance } from "../actions";

const EMPTY: ActionState = {};

const STATUSES = [
  {
    value: "PRESENT",
    label: "Present",
    short: "P",
    icon: Check,
    // Filled in the status's own colour, so a marked sheet reads down the page
    // without anyone decoding four identical circles.
    on: "bg-ok text-surface",
    dot: "bg-ok",
  },
  {
    value: "ABSENT",
    label: "Absent",
    short: "A",
    icon: CircleSlash,
    on: "bg-bad text-surface",
    dot: "bg-bad",
  },
  {
    value: "LATE",
    label: "Late",
    short: "L",
    icon: Clock,
    on: "bg-warn text-surface",
    dot: "bg-warn",
  },
  {
    value: "LEAVE",
    label: "Leave",
    short: "Lv",
    icon: Plane,
    on: "bg-brand text-brand-ink",
    dot: "bg-brand",
  },
] as const;

export type SheetRow = {
  studentId: number;
  fullName: string;
  rollNo: number;
  status: string;
  note: string | null;
};

export function AttendanceSheet({
  sectionId,
  date,
  rows,
  taken,
}: {
  sectionId: number;
  date: string;
  rows: SheetRow[];
  taken: boolean;
}) {
  const [state, action, pending] = useToastedActionState(saveAttendance, EMPTY);
  const [statuses, setStatuses] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.status])),
  );
  const [notes, setNotes] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.note ?? ""])),
  );

  // Ticking a few students and saying what they are is faster than setting
  // every row, so selection drives the bulk actions below.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const set = (studentId: number, value: string) =>
    setStatuses((prev) => ({ ...prev, [studentId]: value }));

  const tally = (value: string) =>
    rows.filter((r) => statuses[r.studentId] === value).length;

  const toggle = (studentId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;

  /// Sets the ticked students only, leaving everyone else as they are.
  function applyToSelected(value: string) {
    setStatuses((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = value;
      return next;
    });
    setSelected(new Set());
  }

  /// "These are the present ones" — the ticked students take `value` and every
  /// other student takes its opposite, which is how a roll call is actually
  /// called out.
  function applyAndInvert(value: "PRESENT" | "ABSENT") {
    const rest = value === "PRESENT" ? "ABSENT" : "PRESENT";
    setStatuses(
      Object.fromEntries(
        rows.map((r) => [r.studentId, selected.has(r.studentId) ? value : rest]),
      ),
    );
    setSelected(new Set());
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="date" value={date} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="text-ink-2 flex cursor-pointer items-center gap-2 text-[12.5px]">
          <Checkbox
            checked={allSelected}
            indeterminate={selected.size > 0 && !allSelected}
            onCheckedChange={(next) =>
              setSelected(next ? new Set(rows.map((r) => r.studentId)) : new Set())
            }
            aria-label="Select all students"
          /><TranslatedText>
          Select all
        </TranslatedText></label>
        <span className="flex-1" />
        <div className="text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          {STATUSES.map((s) => (
            <span key={s.value} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", s.dot)} aria-hidden="true" />
              {s.label}
              <span className="text-ink font-mono tabular-nums">{tally(s.value)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Appears only with a selection, so it never competes with the sheet. */}
      {selected.size > 0 ? (
        <div
          role="status"
          className="border-brand/30 bg-brand-tint flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
        >
          <span className="text-brand-text text-[12.5px] font-medium">
            {selected.size}<TranslatedText> selected
          </TranslatedText></span>
          <span className="text-ink-3 text-[12.5px]"><TranslatedText>Mark them</TranslatedText></span>
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => applyToSelected(s.value)}
            >
              {s.label}
            </Button>
          ))}
          <span className="bg-line mx-1 hidden h-4 w-px sm:block" aria-hidden="true" />
          <Button type="button" size="xs" onClick={() => applyAndInvert("PRESENT")}><TranslatedText>
            These present, rest absent
          </TranslatedText></Button>
          <Button type="button" size="xs" onClick={() => applyAndInvert("ABSENT")}><TranslatedText>
            These absent, rest present
          </TranslatedText></Button>
          <span className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setSelected(new Set())}
          ><TranslatedText>
            Clear
          </TranslatedText></Button>
        </div>
      ) : null}

      <ul className="divide-line divide-y">
        {rows.map((row) => {
          const current = statuses[row.studentId];
          return (
            <Fragment key={row.studentId}>
              <li className="hover:bg-surface-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors">
                <Checkbox
                  checked={selected.has(row.studentId)}
                  onCheckedChange={() => toggle(row.studentId)}
                  aria-label={`Select ${row.fullName}`}
                  className="shrink-0"
                />
                <span className="text-ink-3 w-8 shrink-0 font-mono text-[12px] tabular-nums">
                  {row.rollNo}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{row.fullName}</span>

                {/* A real radio group underneath: the inputs still post with the
                    form and arrow keys still move between options. Only the
                    paint is ours. */}
                <div
                  role="radiogroup"
                  aria-label={`Attendance for ${row.fullName}`}
                  className="bg-surface-2 border-line inline-flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5"
                >
                  {STATUSES.map((s) => {
                    const active = current === s.value;
                    const Icon = s.icon;
                    return (
                      <label
                        key={s.value}
                        title={s.label}
                        className={cn(
                          "relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors",
                          "has-[:focus-visible]:ring-brand/40 has-[:focus-visible]:ring-2",
                          active ? s.on : "text-ink-3 hover:text-ink",
                        )}
                      >
                        <input
                          type="radio"
                          name={`status-${row.studentId}`}
                          value={s.value}
                          checked={active}
                          onChange={() => set(row.studentId, s.value)}
                          aria-label={`${row.fullName}: ${s.label}`}
                          className="sr-only"
                        />
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span aria-hidden="true">{s.short}</span>
                      </label>
                    );
                  })}
                </div>
              </li>

              {current === "LEAVE" ? (
                <li className="px-2 pb-2">
                  <Input
                    name={`note-${row.studentId}`}
                    value={notes[row.studentId] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [row.studentId]: e.target.value }))
                    }
                    placeholder="Reason for leave"
                    maxLength={200}
                    aria-label={`Reason ${row.fullName} is on leave`}
                    className="ml-[4.6rem] h-8 max-w-md text-sm"
                  />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <TranslatedText>{pending ? "Saving…" : taken ? "Update attendance" : "Save attendance"}</TranslatedText>
        </Button>
        {state.error ? <p className="text-bad text-sm">{state.error}</p> : null}
      </div>
    </form>
  );
}
