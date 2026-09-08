"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { PageFrame } from "@/components/ui/page-frame";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/toast";
import type {
  RolloverOptions,
  RolloverPlan,
  SectionKey,
  StudentDecision,
} from "@/lib/registry/rollover-plan";
import { previewRollover, runRollover, type RolloverResult } from "../actions";
import { ReviewStep } from "./review-step";
import { StudentsStep } from "./students-step";
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
  const [targetYearId, setTargetYearId] = useState<number | null>(
    years.find((year) => Number(year.nameBS) === Number(sourceYear.nameBS) + 1)?.id ?? null,
  );
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
  const [done, setDone] = useState(false);
  // Bumped by every `refresh` call and closed over by that call's response
  // handler, so a response can tell whether a later request has since
  // superseded it — plain state would not be visible inside the async
  // callback without landing in its dependency list, and a ref survives
  // rerenders without one.
  const requestId = useRef(0);

  useActionToast({ error: result.error });

  const targetYear = years.find((y) => y.id === targetYearId) ?? null;

  // Takes the target year explicitly: a state update queued by the caller
  // (e.g. setTargetYearId) is not visible yet when this runs.
  const refresh = (next: RolloverOptions, target: number) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const outcome = await previewRollover({
        sourceYearId: sourceYear.id,
        targetYearId: target,
        options: next,
      });
      // A slower earlier request resolving after a faster later one would
      // otherwise win last-write and drag the screen back to a stale plan.
      if (id !== requestId.current) return;
      setResult(outcome);
      setPlan(outcome.plan ?? null);
    });
  };

  // The target year is preselected, so on the common path the operator never
  // touches the select — without this the flow reaches step 2 with no plan.
  // Mount only: every later preview is driven by onTargetYear and update().
  useEffect(() => {
    if (targetYearId !== null) refresh(options, targetYearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<RolloverOptions>) => {
    // Unticking a stage unticks whatever hangs off it: an assignment needs its
    // offering, a period needs its assignment.
    const merged = { ...options, ...patch };
    if (!merged.copyOfferings) merged.copyAssignments = false;
    if (!merged.copyAssignments) merged.copyTimetable = false;
    setOptions(merged);
    // `done` describes one specific completed run of the plan on screen. This
    // and the `onTargetYear` handler below are the only two places that can
    // change what the next preview or run would produce — every other setter
    // (decisions, bulk decisions, placements, the review step's own option
    // toggles) funnels through one of these two — so clearing `done` in both,
    // synchronously and before the new preview even goes out, leaves no path
    // that can change the plan while still showing the previous run as ready.
    setDone(false);
    if (targetYearId !== null) refresh(merged, targetYearId);
  };

  const setDecision = (studentId: number, decision: StudentDecision) => {
    update({ decisions: { ...options.decisions, [studentId]: decision } });
  };

  const setBulk = (studentIds: number[], decision: StudentDecision) => {
    const decisions = { ...options.decisions };
    for (const id of studentIds) decisions[id] = decision;
    update({ decisions });
  };

  const setPlacement = (sourceSectionId: number, targetSectionKey: SectionKey) => {
    update({ placements: { ...options.placements, [sourceSectionId]: targetSectionKey } });
  };

  const run = () => {
    if (targetYearId === null) return;
    startTransition(async () => {
      const outcome = await runRollover({
        sourceYearId: sourceYear.id,
        targetYearId,
        options,
      });
      setResult(outcome);
      if (outcome.plan) {
        setPlan(outcome.plan);
        setDone(true);
      }
    });
  };

  return (
    <PageFrame
      icon={<CalendarPlus />}
      tint="rose"
      eyebrow="Settings"
      breadcrumb={<><Link href="/dashboard/settings?view=academic" className="hover:underline"><TranslatedText>Settings</TranslatedText></Link><TranslatedText> / Academic year transition</TranslatedText></>}
      title="Prepare next academic year"
      subtitle="Set up the year, review each student's placement, then confirm the transition."
      meta={targetYear ? `${sourceYear.nameBS} → ${targetYear.nameBS}` : sourceYear.nameBS}
    >
      <PageFrame.Toolbar>
        <ol aria-label="Academic year preparation progress" className="grid w-full grid-cols-3 gap-2">
          {([ ["year", "Prepare year"], ["students", "Review students"], ["review", "Confirm & activate"] ] as const).map(([value, label], index) => (
            <li key={value} aria-current={step === value ? "step" : undefined}
              className={`rounded-lg border px-3 py-3 text-sm ${step === value ? "border-brand-tint-2 bg-brand-tint text-brand-text" : "border-line text-ink-3"}`}>
              <span className="mb-1 block text-xs"><TranslatedText>Step </TranslatedText>{index + 1}</span>
              <span className="font-medium">{label}</span>
            </li>
          ))}
        </ol>
      </PageFrame.Toolbar>

      <PageFrame.Body className="overflow-y-auto p-4">
        {step !== "year" && !done ? (
          <Button variant="ghost" className="mb-4" disabled={pending}
            onClick={() => setStep(step === "review" ? "students" : "year")}><TranslatedText>
            Back to </TranslatedText><TranslatedText>{step === "review" ? "students" : "year setup"}</TranslatedText>
          </Button>
        ) : null}
        {result.error ? <p role="alert" className="mb-4 text-sm text-destructive">{result.error}</p> : null}
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
              setDone(false);
              refresh(options, id);
            }}
            onOptions={update}
            onContinue={() => setStep("students")}
          />
        ) : null}
        {step === "students" && plan ? (
          <StudentsStep
            plan={plan}
            onDecision={setDecision}
            onBulk={setBulk}
            onContinue={() => { if (!pending) setStep("review"); }}
          />
        ) : null}
        {step === "review" && plan ? (
          <ReviewStep
            plan={plan}
            options={options}
            pending={pending}
            done={done}
            onOptions={update}
            onPlacement={setPlacement}
            onRun={run}
          />
        ) : null}
      </PageFrame.Body>
    </PageFrame>
  );
}
