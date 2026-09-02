"use client";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { RecordTable, StatusPill } from "@/components/ui/record-table";
import { shortGradeList } from "@/lib/registry/grade-label";
import {
  type ActionState,
  editOffering,
  editSubject,
  removeOffering,
  removeSubject,
} from "../actions";

const EMPTY: ActionState = {};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export type SubjectRow = {
  /// Grade names in their own order, shortened for display by the list.
  gradeNames?: string[];
  id: number;
  name: string;
  offerings: number;
};

export type OfferingRow = {
  id: number;
  subjectName: string;
  gradeName: string;
  gradeOrder: number;
  hasPractical: boolean;
  fullMarksTheory: number;
  passMarksTheory: number;
  fullMarksPractical: number | null;
  passMarksPractical: number | null;
  assignments: number;
};

export function SubjectDetail({ row, onDone }: { row: SubjectRow; onDone: () => void }) {
  const [editState, editAction, saving] = useToastedActionState(editSubject, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeSubject, EMPTY);

  return (
    <div className="space-y-5">
      <form key={row.name} action={editAction} className="space-y-4">
        <input type="hidden" name="subjectId" value={row.id} />
        <div className="space-y-2">
          <Label htmlFor={`subn-${row.id}`}>Subject</Label>
          <Input id={`subn-${row.id}`} name="name" defaultValue={row.name} required />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={delAction}>
          <input type="hidden" name="subjectId" value={row.id} />
          <ConfirmSubmit label="Delete subject" confirmLabel="Delete?" pending={deleting} />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
        <Status state={delState} />
      </div>
      <p className="text-muted-foreground text-xs">
        Blocked while the subject is still offered to any grade.
      </p>
    </div>
  );
}

export function OfferingDetail({ row, onDone }: { row: OfferingRow; onDone: () => void }) {
  const [editState, editAction, saving] = useToastedActionState(editOffering, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeOffering, EMPTY);
  const [hasPractical, setHasPractical] = useState(row.hasPractical);

  const signature = [
    row.fullMarksTheory,
    row.passMarksTheory,
    row.hasPractical,
    row.fullMarksPractical,
    row.passMarksPractical,
  ].join("|");

  return (
    <div className="space-y-5">
      <form key={signature} action={editAction} className="space-y-4">
        <input type="hidden" name="offeringId" value={row.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`oft-${row.id}`}>Theory full marks</Label>
            <Input
              id={`oft-${row.id}`}
              name="fullMarksTheory"
              defaultValue={row.fullMarksTheory}
              inputMode="numeric"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`opt-${row.id}`}>Theory pass marks</Label>
            <Input
              id={`opt-${row.id}`}
              name="passMarksTheory"
              defaultValue={row.passMarksTheory}
              inputMode="numeric"
              required
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="hasPractical"
            checked={hasPractical}
            onChange={(e) => setHasPractical(e.target.checked)}
            className="border-input size-4 rounded border"
          />
          This subject has a practical
        </label>

        {hasPractical ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`ofp-${row.id}`}>Practical full marks</Label>
              <Input
                id={`ofp-${row.id}`}
                name="fullMarksPractical"
                defaultValue={row.fullMarksPractical ?? 25}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`opp-${row.id}`}>Practical pass marks</Label>
              <Input
                id={`opp-${row.id}`}
                name="passMarksPractical"
                defaultValue={row.passMarksPractical ?? 10}
                inputMode="numeric"
              />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Turning the practical off clears its marks rather than keeping them hidden.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={delAction}>
          <input type="hidden" name="offeringId" value={row.id} />
          <ConfirmSubmit label="Remove from grade" confirmLabel="Remove?" pending={deleting} />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
        <Status state={delState} />
      </div>
      {row.assignments > 0 ? (
        <p className="text-muted-foreground text-xs">
          {row.assignments} teacher assignment{row.assignments === 1 ? "" : "s"} use this;
          removal is blocked until those are cleared.
        </p>
      ) : null}
    </div>
  );
}

export function SubjectsView({ rows }: { rows: SubjectRow[] }) {
  return (
    <RecordTable
      title="Subject list"
      subtitle="School-wide and reused across grades and years · click a row to edit"
      density="compact"
      rows={rows}
      getKey={(r) => r.id}
      getSearchText={(r) => r.name}
      searchPlaceholder="Search subjects"
      empty="No subjects yet."
      detailTitle={(r) => r.name}
      columns={[
        { key: "name", header: "Subject", span: 5, render: (r) => <span className="font-medium">{r.name}</span> },
        {
          key: "offered",
          header: "Offered in",
          span: 5,
          hideOnMobile: true,
          render: (r) =>
            r.gradeNames && r.gradeNames.length > 0 ? (
              <span className="text-muted-foreground tabular-nums">
                {shortGradeList(r.gradeNames)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          key: "used",
          header: "Grades",
          span: 2,
          render: (r) => (
            <StatusPill tone={r.offerings > 0 ? "positive" : "neutral"}>
              {r.offerings} grade{r.offerings === 1 ? "" : "s"}
            </StatusPill>
          ),
        },
      ]}
      renderDetail={(row, close) => <SubjectDetail row={row} onDone={close} />}
    />
  );
}

