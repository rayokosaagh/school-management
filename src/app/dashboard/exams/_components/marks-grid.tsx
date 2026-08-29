"use client";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluate, type Scheme } from "@/lib/assessment/grading";
import { type ActionState, saveMarksSheet } from "../actions";

const EMPTY: ActionState = {};

export type MarksRow = {
  studentId: number;
  fullName: string;
  rollNo: number;
  theory: number | null;
  practical: number | null;
  isAbsent: boolean;
};

type Draft = { theory: string; practical: string; absent: boolean };

export function MarksGrid({
  examTermId,
  sectionId,
  subjectOfferingId,
  scheme,
  rows,
  locked,
}: {
  examTermId: number;
  sectionId: number;
  subjectOfferingId: number;
  scheme: Scheme;
  rows: MarksRow[];
  locked: boolean;
}) {
  const [state, action, pending] = useToastedActionState(saveMarksSheet, EMPTY);
  const [draft, setDraft] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.studentId,
        {
          theory: r.theory === null ? "" : String(r.theory),
          practical: r.practical === null ? "" : String(r.practical),
          absent: r.isAbsent,
        },
      ]),
    ),
  );

  const set = (id: number, patch: Partial<Draft>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const entered = rows.filter((r) => {
    const d = draft[r.studentId];
    return d?.absent || d?.theory !== "";
  }).length;

  const fullTotal =
    scheme.fullMarksTheory + (scheme.hasPractical ? (scheme.fullMarksPractical ?? 0) : 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examTermId" value={examTermId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="subjectOfferingId" value={subjectOfferingId} />

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>
          Theory out of {scheme.fullMarksTheory}, pass {scheme.passMarksTheory}
        </span>
        {scheme.hasPractical ? (
          <span>
            Practical out of {scheme.fullMarksPractical}, pass {scheme.passMarksPractical}
          </span>
        ) : (
          <span>No practical</span>
        )}
        <span>
          {entered} of {rows.length} entered
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="w-12 py-2 pr-3 font-medium">Roll</th>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="w-24 py-2 pr-3 font-medium">Theory</th>
              {scheme.hasPractical ? (
                <th className="w-24 py-2 pr-3 font-medium">Practical</th>
              ) : null}
              <th className="w-20 py-2 pr-3 font-medium">Total</th>
              <th className="w-16 py-2 pr-3 font-medium">Grade</th>
              <th className="w-20 py-2 font-medium">Absent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = draft[row.studentId] ?? { theory: "", practical: "", absent: false };
              // Previewed live so a mistyped mark is obvious before saving.
              const result = evaluate(
                {
                  theory: d.theory === "" ? null : Number(d.theory),
                  practical: d.practical === "" ? null : Number(d.practical),
                  isAbsent: d.absent,
                },
                scheme,
              );
              const over =
                (d.theory !== "" && Number(d.theory) > scheme.fullMarksTheory) ||
                (scheme.hasPractical &&
                  d.practical !== "" &&
                  Number(d.practical) > (scheme.fullMarksPractical ?? 0));

              return (
                <tr key={row.studentId} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 tabular-nums">{row.rollNo}</td>
                  <td className="py-1.5 pr-3">{row.fullName}</td>
                  <td className="py-1.5 pr-3">
                    <Input
                      name={`theory-${row.studentId}`}
                      value={d.absent ? "" : d.theory}
                      onChange={(e) => set(row.studentId, { theory: e.target.value })}
                      disabled={locked || d.absent}
                      inputMode="numeric"
                      aria-label={`Theory marks for ${row.fullName}`}
                      aria-invalid={over}
                      className="h-8"
                    />
                  </td>
                  {scheme.hasPractical ? (
                    <td className="py-1.5 pr-3">
                      <Input
                        name={`practical-${row.studentId}`}
                        value={d.absent ? "" : d.practical}
                        onChange={(e) => set(row.studentId, { practical: e.target.value })}
                        disabled={locked || d.absent}
                        inputMode="numeric"
                        aria-label={`Practical marks for ${row.fullName}`}
                        aria-invalid={over}
                        className="h-8"
                      />
                    </td>
                  ) : null}
                  <td className="py-1.5 pr-3 tabular-nums">
                    {result.total === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      `${result.total}/${fullTotal}`
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {result.grade === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          result.passed === false
                            ? "font-medium text-red-700 dark:text-red-400"
                            : "font-medium text-emerald-700 dark:text-emerald-400"
                        }
                      >
                        {result.grade.letter}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      name={`absent-${row.studentId}`}
                      checked={d.absent}
                      onChange={(e) => set(row.studentId, { absent: e.target.checked })}
                      disabled={locked}
                      aria-label={`${row.fullName} was absent`}
                      className="size-4"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || locked}>
          {pending ? "Saving…" : "Save marks"}
        </Button>
        {locked ? (
          <p className="text-muted-foreground text-sm">
            This exam is published. Unpublish it to edit marks.
          </p>
        ) : null}
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
    </form>
  );
}
