"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kpi } from "@/components/ui/kpi";
import { Callout } from "@/components/ui/page-shell";
import { FieldSelect } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import type { RolloverOptions, RolloverPlan, SectionKey, StageCount } from "@/lib/registry/rollover-plan";
import { cn } from "@/lib/utils";

function stage(count: StageCount) {
  return count.existing === 0 && count.skipped === 0
    ? undefined
    : [
        count.existing > 0 ? `${count.existing} already there` : null,
        count.skipped > 0 ? `${count.skipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(" · ");
}

/// The last screen before anything is written. Everything it shows comes from
/// the same plan the server will rebuild, so there are no surprises.
export function ReviewStep({
  plan,
  options,
  pending,
  done,
  onOptions,
  onPlacement,
  onRun,
}: {
  plan: RolloverPlan;
  options: RolloverOptions;
  pending: boolean;
  done: boolean;
  onOptions: (patch: Partial<RolloverOptions>) => void;
  onPlacement: (sourceSectionId: number, targetSectionKey: SectionKey) => void;
  onRun: () => void;
}) {
  const blocked = plan.blockers.length > 0;
  // Local to this step: the confirm dialog only ever needs to know whether
  // it is open, and it always starts closed.
  const [confirming, setConfirming] = useState(false);

  if (done) {
    return (
      <Callout icon={CheckCircle2} tint="green">
        Academic year {plan.targetYear.nameBS} is ready: {plan.sections.create} section(s),{" "}
        {plan.students.promote.length} promoted, {plan.students.retain.length} retained,{" "}
        {plan.students.graduate.length} graduated.
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toggling makeTargetCurrent or a placement below re-previews the plan
          (see rollover-workspace's update()), so this whole read-out is
          dimmed rather than left showing stale numbers with no sign a new
          plan is on the way. */}
      <div aria-busy={pending} className={cn("space-y-5 transition-opacity", pending && "opacity-60")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi value={plan.sections.create} label="Sections" hint={stage(plan.sections)} />
          <Kpi value={plan.offerings.create} label="Offerings" hint={stage(plan.offerings)} />
          <Kpi value={plan.assignments.create} label="Assignments" hint={stage(plan.assignments)} />
          <Kpi value={plan.timetable.create} label="Periods" hint={stage(plan.timetable)} />
          <Kpi value={plan.students.promote.length} label="Promoting" />
          <Kpi value={plan.students.retain.length} label="Retaining" />
          <Kpi value={plan.students.graduate.length} label="Graduating" />
          <Kpi value={plan.students.leave.length} label="Leaving" />
        </div>

        {plan.unplaceable.map((group) => (
          <div key={group.sourceSectionId} className="border-line bg-surface rounded-[10px] border p-4">
            <p className="text-sm">
              {group.label} has {group.count} student(s) and no matching section in the grade above.
              Choose where they go.
            </p>
            <div className="pt-2">
              <FieldSelect
                aria-label={`Where ${group.label} goes`}
                value={options.placements[group.sourceSectionId] ?? ""}
                onValueChange={(value) => {
                  if (value) onPlacement(group.sourceSectionId, value);
                }}
                placeholder={
                  group.choices.length === 0 ? "No sections in that grade yet" : "Choose a section"
                }
                options={group.choices.map((c) => ({ value: c.key, label: c.label }))}
              />
            </div>
          </div>
        ))}

        {blocked ? (
          <Callout icon={AlertTriangle} tint="rose">
            <ul className="space-y-1">
              {plan.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox
          checked={options.makeTargetCurrent}
          onCheckedChange={(checked) => onOptions({ makeTargetCurrent: checked === true })}
        />
        Activate {plan.targetYear.nameBS} for the whole school immediately
      </label>
      <p className="text-ink-2 text-sm">
        {options.makeTargetCurrent
          ? "Everyone's year-scoped pages will switch to the new year. Check fee prices and service registrations before issuing new bills."
          : "The school will stay in the current year. You can activate the prepared year later using the academic-year selector."}
        {" "}Graduated and departed students are marked immediately when you confirm, regardless of activation.
      </p>

      <Button disabled={blocked || pending} onClick={() => setConfirming(true)}>
        {pending ? "Rolling over…" : `Roll ${plan.sourceYear.nameBS} into ${plan.targetYear.nameBS}`}
      </Button>

      <Modal
        open={confirming}
        title="Confirm the rollover"
        onClose={() => setConfirming(false)}
      >
        <div className="space-y-4">
          <p className="text-sm">
            This copies {plan.sections.create} section(s), {plan.offerings.create} offering(s),{" "}
            {plan.assignments.create} assignment(s) and {plan.timetable.create} period(s) into{" "}
            {plan.targetYear.nameBS}, then places {plan.students.promote.length + plan.students.retain.length}{" "}
            student(s) as promoted or retained, {plan.students.graduate.length} as graduated and{" "}
            {plan.students.leave.length} as left. It cannot be undone from here.
          </p>
          <Button
            disabled={blocked || pending}
            onClick={() => {
              setConfirming(false);
              onRun();
            }}
          >
            {pending ? "Rolling over…" : "Yes, roll it over"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
