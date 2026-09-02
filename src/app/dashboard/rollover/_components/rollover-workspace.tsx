"use client";

import { useState, useTransition } from "react";
import { PageFrame } from "@/components/ui/page-frame";
import { Segmented } from "@/components/ui/segmented";
import { useActionToast } from "@/components/ui/toast";
import type { RolloverOptions, RolloverPlan } from "@/lib/registry/rollover-plan";
import { previewRollover, type RolloverResult } from "../actions";
import { YearStep } from "./year-step";

export type YearOption = { id: number; nameBS: string; sections: number; enrollments: number };

type Step = "year" | "students" | "review";

/// The whole flow's state lives here: three steps read and write one
/// RolloverOptions, so the preview and the run can never disagree about what
/// the operator asked for.
export function RolloverWorkspace({
  sourceYear,
  years,
  examTerms,
}: {
  sourceYear: { id: number; nameBS: string };
  years: YearOption[];
  examTerms: { id: number; name: string }[];
}) {
  const [step, setStep] = useState<Step>("year");
  const [targetYearId, setTargetYearId] = useState<number | null>(years[0]?.id ?? null);
  const [options, setOptions] = useState<RolloverOptions>({
    copyOfferings: true,
    copyAssignments: true,
    copyTimetable: true,
    rollOrder: "ALPHABETICAL",
    markOrderExamTermId: null,
    decisions: {},
    placements: {},
    makeTargetCurrent: false,
  });
  const [plan, setPlan] = useState<RolloverPlan | null>(null);
  const [result, setResult] = useState<RolloverResult>({});
  const [pending, startTransition] = useTransition();

  useActionToast({ error: result.error });

  const targetYear = years.find((y) => y.id === targetYearId) ?? null;

  // Takes the target year explicitly: a state update queued by the caller
  // (e.g. setTargetYearId) is not visible yet when this runs.
  const refresh = (next: RolloverOptions, target: number) => {
    startTransition(async () => {
      const outcome = await previewRollover({
        sourceYearId: sourceYear.id,
        targetYearId: target,
        options: next,
      });
      setResult(outcome);
      if (outcome.plan) setPlan(outcome.plan);
    });
  };

  const update = (patch: Partial<RolloverOptions>) => {
    if (targetYearId === null) return;
    // Unticking a stage unticks whatever hangs off it: an assignment needs its
    // offering, a period needs its assignment.
    const merged = { ...options, ...patch };
    if (!merged.copyOfferings) merged.copyAssignments = false;
    if (!merged.copyAssignments) merged.copyTimetable = false;
    setOptions(merged);
    refresh(merged, targetYearId);
  };

  return (
    <PageFrame
      eyebrow="School"
      title="Next year"
      meta={targetYear ? `${sourceYear.nameBS} → ${targetYear.nameBS}` : sourceYear.nameBS}
    >
      <PageFrame.Toolbar>
        <Segmented
          value={step}
          onChange={setStep}
          ariaLabel="Rollover step"
          options={[
            { value: "year", label: "1. Year" },
            { value: "students", label: "2. Students" },
            { value: "review", label: "3. Review" },
          ]}
        />
      </PageFrame.Toolbar>

      <PageFrame.Body className="overflow-y-auto p-4">
        {step === "year" ? (
          <YearStep
            sourceYear={sourceYear}
            years={years}
            examTerms={examTerms}
            targetYearId={targetYearId}
            options={options}
            plan={plan}
            pending={pending}
            onTargetYear={(id) => {
              setTargetYearId(id);
              setPlan(null);
              refresh(options, id);
            }}
            onOptions={update}
            onContinue={() => setStep("students")}
          />
        ) : null}
        {/* Steps 2 and 3 arrive in the next two tasks. */}
      </PageFrame.Body>
    </PageFrame>
  );
}
