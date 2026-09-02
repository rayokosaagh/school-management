"use client";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Weights } from "@/lib/honours/score";
import { type WeightsState, updateHonoursWeights } from "../actions";

const EMPTY: WeightsState = {};

const FIELDS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: "exams", label: "Exams", hint: "Average of the published terms" },
  { key: "attendance", label: "Attendance", hint: "Present or late, over the year" },
  { key: "conduct", label: "Conduct", hint: "Merits raise it, demerits lower it" },
  { key: "activities", label: "Activities", hint: "Points from participations, capped" },
];

export function HonoursWeightsForm({ weights }: { weights: Weights }) {
  const [state, action, pending] = useToastedActionState(updateHonoursWeights, EMPTY);
  const [draft, setDraft] = useState<Record<keyof Weights, string>>({
    exams: String(weights.exams),
    attendance: String(weights.attendance),
    conduct: String(weights.conduct),
    activities: String(weights.activities),
  });

  const sum = FIELDS.reduce((total, f) => total + (Number(draft[f.key]) || 0), 0);
  const balanced = sum === 100;

  return (
    <form
      key={`${weights.exams}-${weights.attendance}-${weights.conduct}-${weights.activities}`}
      action={action}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`weight-${f.key}`}>{f.label}</Label>
            <Input
              id={`weight-${f.key}`}
              name={f.key}
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              required
            />
            <p className="text-muted-foreground text-xs">{f.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !balanced}>
          {pending ? "Saving…" : "Save weighting"}
        </Button>
        <p
          className={
            balanced
              ? "text-muted-foreground text-sm tabular-nums"
              : "text-destructive text-sm tabular-nums"
          }
          aria-live="polite"
        >
          {balanced ? "Adds up to 100." : `Adds up to ${sum}; it must be 100.`}
        </p>
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
      <p className="text-muted-foreground text-xs">
        A student needs a published exam result to be ranked. When they have no
        roll call yet, the attendance weight is left out for them rather than
        counted as absent.
      </p>
    </form>
  );
}
