"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BsDateField } from "@/components/ui/bs-date-field";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DetailPane } from "@/components/ui/detail-pane";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { toBsInput } from "@/lib/date/bs";
import type { StudentHonours } from "@/lib/honours/honours";
import { ACTIVITY_POINTS, ordinal } from "@/lib/honours/score";
import { ACTIVITY_LEVEL_OPTIONS, CONDUCT_KIND_OPTIONS } from "@/lib/registry/options";
import {
  type ActionState,
  removeActivity,
  removeConduct,
  saveActivity,
  saveConduct,
} from "../actions";

const EMPTY: ActionState = {};

function Pillar({ label, value, weight }: { label: string; value: number | null; weight: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 text-[11px] whitespace-nowrap">
        {label} <span className="font-mono">×{weight}</span>
      </dt>
      <dd className="mt-px font-mono font-medium tabular-nums">
        {value === null ? "—" : Math.round(value)}
      </dd>
    </div>
  );
}

/// Closes an inline form once its action reports success, and leaves it open
/// with the message when it does not.
function useCloseOnSuccess(state: ActionState, close: () => void) {
  useEffect(() => {
    if (state.success) close();
    // `close` is a stable setter call; only the success message matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);
}

/// Standing, conduct and activities for the read view of the pane. Forms are
/// hidden behind "Add" so the pane stays a record first and an editor second.
export function HonoursSections({
  studentId,
  honours,
}: {
  studentId: number;
  honours: StudentHonours;
}) {
  const [conductState, conductAction, savingConduct] = useToastedActionState(saveConduct, EMPTY);
  const [, conductRemove] = useToastedActionState(removeConduct, EMPTY);
  const [activityState, activityAction, savingActivity] = useToastedActionState(saveActivity, EMPTY);
  const [, activityRemove] = useToastedActionState(removeActivity, EMPTY);
  const [addingConduct, setAddingConduct] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const [level, setLevel] = useState<keyof typeof ACTIVITY_POINTS>("PARTICIPATED");
  const [activityPoints, setActivityPoints] = useState(String(ACTIVITY_POINTS.PARTICIPATED));

  useCloseOnSuccess(conductState, () => setAddingConduct(false));
  useCloseOnSuccess(activityState, () => setAddingActivity(false));

  const today = toBsInput(new Date());
  const w = honours.weights;

  return (
    <>
      <DetailPane.Section label="Standing">
        <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {honours.position === null ? "—" : ordinal(honours.position)}
          <span className="font-body text-ink-3 ml-1.5 text-[12.5px] font-normal tracking-normal">
            {honours.position === null
              ? "awaiting a published result"
              : `of ${honours.classSize} · score ${honours.overall?.toFixed(1)}`}
          </span>
        </p>
        <dl className="mt-2.5 grid grid-cols-4 gap-x-3">
          <Pillar label="Exam" value={honours.pillars.exams} weight={w.exams} />
          <Pillar label="Attend" value={honours.pillars.attendance} weight={w.attendance} />
          <Pillar label="Conduct" value={honours.pillars.conduct} weight={w.conduct} />
          <Pillar label="Activity" value={honours.pillars.activities} weight={w.activities} />
        </dl>
      </DetailPane.Section>

      <DetailPane.Section label="Conduct this year">
        <ul className="space-y-1.5 text-[12.5px]">
          {honours.conduct.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="text-ink-3 font-mono tabular-nums">{c.dateBs}</span>
              <span
                className={
                  c.kind === "MERIT"
                    ? "text-ok font-mono tabular-nums"
                    : "text-bad font-mono tabular-nums"
                }
              >
                {c.kind === "MERIT" ? "+" : "−"}
                {c.points}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.note}</span>
              <form action={conductRemove}>
                <input type="hidden" name="conductId" value={c.id} />
                <ConfirmSubmit label="Remove" confirmLabel="Remove?" pendingLabel="Removing…" size="sm" icon />
              </form>
            </li>
          ))}
          {honours.conduct.length === 0 ? (
            <li className="text-ink-3">No merits or demerits recorded.</li>
          ) : null}
        </ul>
        {addingConduct ? (
          <form action={conductAction} className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <input type="hidden" name="studentId" value={studentId} />
            <div className="space-y-1">
              <Label htmlFor={`ck-${studentId}`}>Kind</Label>
              <FieldSelect id={`ck-${studentId}`} name="kind" defaultValue="MERIT" options={CONDUCT_KIND_OPTIONS} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cp-${studentId}`}>Points</Label>
              <Input id={`cp-${studentId}`} name="points" type="number" min={1} max={100} defaultValue={5} required />
            </div>
            <BsDateField id={`cd-${studentId}`} name="dateBs" label="Date (BS)" defaultValue={today} required />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`cn-${studentId}`}>What happened</Label>
              <Input id={`cn-${studentId}`} name="note" maxLength={200} placeholder="A few words" required />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={savingConduct}>
                {savingConduct ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddingConduct(false)}>
                <X data-icon="inline-start" aria-hidden="true" />
                Cancel
              </Button>
              {conductState.error ? <p className="text-destructive text-sm">{conductState.error}</p> : null}
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddingConduct(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add merit or demerit
          </Button>
        )}
      </DetailPane.Section>

      <DetailPane.Section label="Activities this year">
        <ul className="space-y-1.5 text-[12.5px]">
          {honours.activities.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="text-ink-3 font-mono tabular-nums">{a.dateBs}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.name}{" "}
                <span className="text-ink-3">
                  · {a.level[0]}
                  {a.level.slice(1).toLowerCase()}
                </span>
              </span>
              <span className="font-mono tabular-nums">+{a.points}</span>
              <form action={activityRemove}>
                <input type="hidden" name="activityId" value={a.id} />
                <ConfirmSubmit label="Remove" confirmLabel="Remove?" pendingLabel="Removing…" size="sm" icon />
              </form>
            </li>
          ))}
          {honours.activities.length === 0 ? <li className="text-ink-3">No activities recorded.</li> : null}
        </ul>
        {addingActivity ? (
          <form action={activityAction} className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <input type="hidden" name="studentId" value={studentId} />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`an-${studentId}`}>Activity</Label>
              <Input id={`an-${studentId}`} name="name" maxLength={80} placeholder="Science fair, football, debate…" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`al-${studentId}`}>Result</Label>
              <FieldSelect
                id={`al-${studentId}`}
                name="level"
                value={level}
                onValueChange={(v) => {
                  const next = (v ?? "PARTICIPATED") as keyof typeof ACTIVITY_POINTS;
                  setLevel(next);
                  setActivityPoints(String(ACTIVITY_POINTS[next]));
                }}
                options={ACTIVITY_LEVEL_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ap-${studentId}`}>Points</Label>
              <Input
                id={`ap-${studentId}`}
                name="points"
                type="number"
                min={1}
                max={100}
                value={activityPoints}
                onChange={(e) => setActivityPoints(e.target.value)}
                required
              />
            </div>
            <BsDateField id={`ad-${studentId}`} name="dateBs" label="Date (BS)" defaultValue={today} required />
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={savingActivity}>
                {savingActivity ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddingActivity(false)}>
                <X data-icon="inline-start" aria-hidden="true" />
                Cancel
              </Button>
              {activityState.error ? <p className="text-destructive text-sm">{activityState.error}</p> : null}
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddingActivity(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add activity
          </Button>
        )}
      </DetailPane.Section>
    </>
  );
}
