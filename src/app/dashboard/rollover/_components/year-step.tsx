"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/ui/page-shell";
import { FieldSelect } from "@/components/ui/select";
import { ROLL_ORDER_LABEL, isRollOrder } from "@/lib/registry/roll-order";
import type { RolloverOptions, RolloverPlan } from "@/lib/registry/rollover-plan";
import { cn } from "@/lib/utils";
import { addTargetYear } from "../actions";
import type { YearOption } from "./rollover-workspace";

export function YearStep({
  sourceYear,
  years,
  examTerms,
  targetYearId,
  options,
  plan,
  pending,
  onTargetYear,
  onOptions,
  onContinue,
}: {
  sourceYear: { id: number; nameBS: string };
  years: YearOption[];
  examTerms: { id: number; name: string }[];
  targetYearId: number | null;
  options: RolloverOptions;
  plan: RolloverPlan | null;
  pending: boolean;
  onTargetYear: (id: number) => void;
  onOptions: (patch: Partial<RolloverOptions>) => void;
  onContinue: () => void;
}) {
  const [newYear, setNewYear] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <Callout icon={Info} tint="blue">
        <p className="font-medium"><TranslatedText>Prepare first. Activate when the school is ready.</TranslatedText></p>
        <p className="mt-1"><TranslatedText>Existing records stay in </TranslatedText>{sourceYear.nameBS}<TranslatedText>. Fee prices, transport and other service registrations do not copy; set them up separately for the new year.</TranslatedText></p>
        <p className="mt-1"><TranslatedText>Student decisions take effect when you confirm, even if you leave the current year unchanged. There is no undo button.</TranslatedText></p>
      </Callout>
      <section className="space-y-2">
        <Label htmlFor="target-year"><TranslatedText>Roll </TranslatedText>{sourceYear.nameBS}<TranslatedText> into</TranslatedText></Label>
        <div className="flex gap-2">
          <FieldSelect
            id="target-year"
            aria-label="Target academic year"
            value={targetYearId === null ? "" : String(targetYearId)}
            // base-ui hands back null when a select is cleared.
            onValueChange={(value) => {
              if (value) onTargetYear(Number(value));
            }}
            placeholder="Choose a year"
            options={years.map((y) => ({
              value: String(y.id),
              label:
                y.sections === 0
                  ? `${y.nameBS} — empty`
                  : `${y.nameBS} — ${y.sections} section(s), ${y.enrollments} student(s)`,
            }))}
          />
        </div>
        <div className="flex items-end gap-2 pt-2">
          <div className="space-y-1">
            <Label htmlFor="new-year"><TranslatedText>Or create a year</TranslatedText></Label>
            <Input
              id="new-year"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              placeholder={String(Number(sourceYear.nameBS) + 1)}
              disabled={creating || pending}
              inputMode="numeric"
              className="w-32 font-mono"
            />
          </div>
          <Button
            variant="secondary"
            disabled={creating || pending || newYear.trim() === ""}
            onClick={async () => {
              if (!/^\d{4}$/.test(newYear.trim()) || Number(newYear) <= Number(sourceYear.nameBS)) {
                setCreateError("Enter a four-digit BS year later than the current year.");
                return;
              }
              setCreating(true);
              setCreateError(null);
              try {
                const made = await addTargetYear(newYear.trim());
                if (made.id !== undefined) {
                  setNewYear("");
                  onTargetYear(made.id);
                } else setCreateError(made.error ?? "Could not create the year. Try again.");
              } catch {
                setCreateError("Could not create the year. Try again.");
              } finally {
                setCreating(false);
              }
            }}
          >
            <TranslatedText>{creating ? "Creating…" : "Create"}</TranslatedText>
          </Button>
        </div>
        {createError ? <p role="alert" className="text-destructive text-sm">{createError}</p> : null}
        <p className="text-ink-3 text-xs"><TranslatedText>Creating a year saves an empty year only. It does not promote students or activate it.</TranslatedText></p>
      </section>

      <section className="space-y-3">
        <p className="text-ink-3 text-[11px] font-medium tracking-[0.1em] uppercase"><TranslatedText>
          What to copy
        </TranslatedText></p>
        <p className="text-ink-2 text-sm"><TranslatedText>
          Sections always copy — promoted students need somewhere to land.
        </TranslatedText></p>
        {(
          [
            ["copyOfferings", "Subject offerings, with their full and pass marks"],
            ["copyAssignments", "Which teacher takes which subject in which section"],
            ["copyTimetable", "The weekly timetable"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={options[field]}
              onCheckedChange={(checked) => onOptions({ [field]: checked === true })}
            />
            {label}
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <Label htmlFor="roll-order"><TranslatedText>New roll numbers</TranslatedText></Label>
        <FieldSelect
          id="roll-order"
          aria-label="Roll number order"
          value={options.rollOrder}
          onValueChange={(value) => {
            if (value && isRollOrder(value)) onOptions({ rollOrder: value });
          }}
          options={Object.entries(ROLL_ORDER_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {options.rollOrder === "MARKS" ? (
          <FieldSelect
            aria-label="Exam term for roll order"
            value={options.markOrderExamTermId === null ? "" : String(options.markOrderExamTermId)}
            onValueChange={(value) => {
              if (value) onOptions({ markOrderExamTermId: Number(value) });
            }}
            placeholder="Choose the exam term"
            options={examTerms.map((t) => ({ value: String(t.id), label: t.name }))}
          />
        ) : null}
      </section>

      {/* Every toggle above re-previews the plan, so the numbers here go
          stale the instant one changes — dimmed rather than hidden, since
          the old plan is still the best guess until the new one lands. */}
      <div aria-busy={pending} className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
        {plan && plan.blockers.length > 0 ? (
          <Callout icon={AlertTriangle} tint="rose">
            <ul className="space-y-1">
              {plan.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        {plan && plan.blockers.length === 0 ? (
          <Callout icon={Info} tint="blue">
            {plan.sections.create}<TranslatedText> section(s), </TranslatedText>{plan.offerings.create}<TranslatedText> offering(s),</TranslatedText><TranslatedText>{" "}</TranslatedText>
            {plan.assignments.create}<TranslatedText> assignment(s) and </TranslatedText>{plan.timetable.create}<TranslatedText> timetable period(s)
            would be created.
          </TranslatedText></Callout>
        ) : null}
      </div>

      {/* Step 2 renders only when plan is set — without this check a stale or
          in-flight preview would strand the operator on a blank panel. */}
      <Button disabled={targetYearId === null || pending || creating || !plan} onClick={onContinue}><TranslatedText>
        Continue to students
      </TranslatedText></Button>
    </div>
  );
}
