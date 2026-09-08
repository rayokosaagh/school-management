"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { CalendarDays, Layers, Send } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { BS_MONTHS } from "@/lib/date/bs";
import type { feeWorkspace } from "@/lib/fees/fees";
import { money } from "@/lib/fees/money";
import { groupBillingByGrade, type BillingSlice, type GradeBilling } from "@/lib/fees/grouped-billing";
import { issueEveryClass, type FeeActionState } from "../actions";
import { IssueForm } from "./fees-forms";
import { FeeMatrix } from "./fee-matrix";
import { StepPanel } from "./step-panel";
import { SetupHeader } from "./setup-header";
import { StepTabs } from "./step-tabs";

type FeesData = Awaited<ReturnType<typeof feeWorkspace>>;
const EMPTY: FeeActionState = {};

function BillingPeriod({ title, plans }: { title: string; plans: BillingSlice[] }) {
  if (plans.length === 0) return null;
  return (
    <section className="border-line border-t px-5 py-5 sm:px-6">
      <h4 className="mb-4 text-sm font-semibold">{title}</h4>
      <div className="space-y-5">
        {plans.map(plan => (
          <div key={plan.structureId} className="bg-surface-2 border-line min-w-0 rounded-xl border p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                {plans.length > 1 ? <h5 className="text-sm font-medium">{plan.name}</h5> : null}
                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  {plan.lines.map(line => (
                    <div key={line.feeHeadId} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <dt className="text-ink-3">{line.feeHead.name}</dt>
                      <dd className="text-ink-2 font-medium tabular-nums">{money(line.amount)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {plans.length > 1 ? <p className="text-sm font-semibold tabular-nums">{money(plan.total)}<span className="text-ink-3 ml-1 text-xs font-normal"><TranslatedText>{plan.monthly ? "/ month" : "/ year"}</TranslatedText></span></p> : null}
            </div>
            <div className="border-line border-t pt-4">
              <IssueForm structureId={plan.structureId} issued={plan.issued} monthly={plan.monthly} months={plan.months} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/// Bills the whole school for one period in a single press.
///
/// The cards below bill one class at a time, which is the careful way and the
/// slow way: twelve classes in Bhadra is twelve presses, and the one that gets
/// missed is not noticed until a parent asks. This is deliberately blunt — it
/// takes a period and nothing else, ignores the grade filter above it, and
/// skips whatever is already billed.
function IssueEveryClass({ academicYearId, yearLabel, structures }: {
  academicYearId: number; yearLabel: string; structures: FeesData["structures"];
}) {
  const id = useId();
  const [state, action, pending] = useToastedActionState(issueEveryClass, EMPTY);
  // Every monthly plan carries the same twelve months with the same "has this
  // month begun" flags, so any one of them is the year's calendar.
  const calendar = structures.find(plan => plan.monthly)?.months ?? [];
  const monthly = structures.filter(plan => plan.lines.some(line => line.feeHead.frequency === "MONTHLY"));
  const yearly = structures.filter(plan => plan.lines.some(line => line.feeHead.frequency === "ONE_TIME"));
  const [period, setPeriod] = useState(() => String(calendar.filter(month => month.started).at(-1)?.month ?? 0));
  const month = Number(period);
  // How many classes the run would actually bill. A plan already issued for
  // the period contributes nothing, so this is the honest size of the press.
  const waiting = month === 0
    ? yearly.filter(plan => plan.onceIssued === 0).length
    : monthly.filter(plan => (plan.months.find(item => item.month === month)?.issued ?? 0) === 0).length;
  const started = month === 0 || calendar.some(item => item.month === month && item.started);

  const periodName = month === 0 ? "admission and yearly charges" : BS_MONTHS[month - 1];

  return (
    <form action={action} className="ml-auto flex w-full shrink-0 flex-wrap items-end justify-end gap-3 sm:w-auto">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="month" value={month} />
      {/* The gap sits on the label, not on a `space-y-2` wrapper: the select
          renders a zero-height node after its trigger, which `space-y` gives a
          top margin to. That left the column's box 8px below the visible
          field, and `items-end` dutifully aligned the button to the box. */}
      <div className="w-full sm:w-56">
        <Label htmlFor={`${id}-period`} className="mb-2"><TranslatedText>Billing period</TranslatedText></Label>
        <FieldSelect
          id={`${id}-period`}
          aria-label="Billing period for every class"
          value={period}
          onValueChange={value => setPeriod(value ?? "0")}
          disabled={pending}
          options={[
            { value: "0", label: "Admission & yearly charges" },
            ...calendar.map(item => ({
              value: String(item.month),
              label: `${BS_MONTHS[item.month - 1]}${item.started ? "" : " · Not started"}`,
              disabled: !item.started,
            })),
          ]}
        />
      </div>
      <Button
        type="submit"
        // h-10, matching the field beside it: paired controls on one row
        // should share a height, not just a baseline.
        size="xl"
        disabled={pending || !started || waiting === 0}
        // The card that used to carry this explanation is gone; the caveats
        // still have to be somewhere a hesitating clerk can find them.
        title={`Bills every class with a plan for ${yearLabel}, whatever the grade filter shows. Classes already billed for the period are skipped and existing bills are untouched.`}
      >
        <Send data-icon="inline-start" aria-hidden="true" /><TranslatedText>{pending ? "Issuing…" : "Issue for every class"}</TranslatedText>
      </Button>
      <p className="text-ink-3 w-full text-right text-xs leading-5" role="status">
        <TranslatedText>{!started
          ? "Billing opens when the selected month begins."
          : waiting > 0
            ? `${waiting} class${waiting === 1 ? "" : "es"} not yet billed for ${periodName}. Already billed classes are skipped.`
            : `Every class with a plan has already been billed for ${periodName}.`}</TranslatedText>
      </p>
      {state.error ? <p role="alert" className="text-bad w-full text-right text-sm">{state.error}</p> : null}
    </form>
  );
}

function GradeCard({ group }: { group: GradeBilling }) {
  return (
    <article className="bg-surface border-line min-w-0 overflow-hidden rounded-xl border">
      <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{group.grade.name}</h3>
            <Badge variant="outline"><TranslatedText>Class billing</TranslatedText></Badge>
          </div>
          <p className="text-ink-3 mt-1 text-sm"><TranslatedText>Admission and yearly charges stay separate from monthly fees.</TranslatedText></p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          {group.yearly.length > 0 ? (
            <div>
              <dt className="text-ink-3 text-xs"><TranslatedText>Admission / yearly</TranslatedText></dt>
              <dd className="font-display mt-1 text-xl font-semibold tabular-nums">{money(group.yearlyTotal)}</dd>
              <p className="text-ink-3 mt-1 text-xs"><TranslatedText>per pupil / year</TranslatedText></p>
            </div>
          ) : null}
          {group.monthly.length > 0 ? (
            <div>
              <dt className="text-ink-3 text-xs"><TranslatedText>Monthly fees</TranslatedText></dt>
              <dd className="font-display mt-1 text-xl font-semibold tabular-nums">{money(group.monthlyTotal)}</dd>
              <p className="text-ink-3 mt-1 text-xs"><TranslatedText>per pupil / month</TranslatedText></p>
            </div>
          ) : null}
        </dl>
      </header>
      <BillingPeriod title="Admission & yearly billing" plans={group.yearly} />
      <BillingPeriod title="Monthly billing" plans={group.monthly} />
    </article>
  );
}

// `managedHeads` left with the page header, which is where the fee-type sheet
// lives now; this only needs the active heads it prices.
export function SetupTab({ academicYearId, yearLabel, grades, heads, structures, services }: Pick<FeesData, "grades" | "heads" | "structures"> & {
  academicYearId: number; yearLabel: string; services?: ReactNode;
}) {
  const [view, setView] = useState<"pricing" | "billing" | "services">("pricing");
  const [grade, setGrade] = useState("");
  const groups = groupBillingByGrade(structures).filter(group => grade === "" || String(group.grade.id) === grade);
  const plansCount = structures.length;
  // Every monthly plan carries the same twelve months, so any one of them is
  // the year's calendar.
  const calendar = structures.find(plan => plan.monthly)?.months ?? [];
  const currentPeriodName = BS_MONTHS[(calendar.filter(item => item.started).at(-1)?.month ?? 1) - 1];
  const issuedCount = structures.reduce((sum, plan) => sum + plan.issued, 0);

  return (
    <div className="min-w-0 space-y-6 pb-6 pt-3">
      {/* The old "Fee setup" heading and its sentence said what the page
          header now says, and "Manage fee types" moved up there with them —
          leaving the numbered steps to start the page, which is the point of
          numbering them. */}
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="min-w-0 max-w-full overflow-x-auto">
          <StepTabs
            ariaLabel="Fee setup step"
            value={view}
            onChange={setView}
            steps={[
              { value: "pricing" as const, label: "Class pricing" },
              { value: "billing" as const, label: "Issue bills" },
              ...(services ? [{ value: "services" as const, label: "Services" }] : []),
            ]}
          />
        </div>
        {/* The fee-type and grade counts moved up into the page header, under
            the sentence they qualify. Only the grade filter belongs on this
            row, and only on the step it filters. */}
        {view === "billing" ? <FieldSelect aria-label="Filter billing plans by grade" value={grade} onValueChange={value => setGrade(value ?? "")} className="w-full sm:w-48" options={[{ value: "", label: "All grades" }, ...grades.map(g => ({ value: String(g.id), label: g.name }))]} /> : null}
      </div>
      {/* Every step stays mounted so unsaved amounts and plan drafts survive a
          switch; `StepPanel` owns the fade and the `hidden` attribute that
          keeps an inactive step's forms out of the tab order. */}
      {/* No separate header above the card: the step tab already says "Class
          pricing", and the card's own header names the class you are pricing.
          Two titles for one screen is one title too many. */}
      <StepPanel visible={view === "pricing"} label="Class pricing" className="bg-surface border-line min-w-0 overflow-hidden rounded-xl border">
        <FeeMatrix key={academicYearId} academicYearId={academicYearId} yearLabel={yearLabel} grades={grades} heads={heads} structures={structures} />
      </StepPanel>

      <StepPanel visible={view === "billing"} label="Issue bills" className="bg-surface border-line min-w-0 overflow-hidden rounded-xl border">
        {/* The whole-school run rides in the header rather than in a card of
            its own: it is the same job as the class cards below, done in one
            press, and a box around it read as a separate feature. */}
        <SetupHeader
          icon={Send}
          eyebrow={`ISSUE BILLS · ${yearLabel}`}
          title="Bill a class"
          description="Choose a month or send a yearly bill. Only active pupils who have not already been billed are included. Save any pricing changes first."
          stats={[
            { icon: Layers, value: `${plansCount} ${plansCount === 1 ? "class plan" : "class plans"}`, note: "Ready to bill from" },
            { icon: CalendarDays, value: currentPeriodName, note: "Current billing month" },
            { icon: Send, value: `${issuedCount} issued`, note: `Bills raised so far in ${yearLabel}` },
          ]}
          actions={structures.length ? <IssueEveryClass academicYearId={academicYearId} yearLabel={yearLabel} structures={structures} /> : undefined}
        />
        <div className="space-y-5 p-5 sm:p-7">
          {groups.length ? <div className="space-y-5">{groups.map(group => <GradeCard key={group.grade.id} group={group} />)}</div> : (
            <EmptyState icon={Layers} tint="rose" title={structures.length ? "No plans for this grade" : "No bills ready yet"} description="Set and save class amounts in Class pricing, then return here to issue bills." action={<Button variant="outline" onClick={() => setView("pricing")}><TranslatedText>Open class pricing</TranslatedText></Button>} />
          )}
        </div>
      </StepPanel>
      {services ? <StepPanel visible={view === "services"} label="Services">{services}</StepPanel> : null}
    </div>
  );
}
