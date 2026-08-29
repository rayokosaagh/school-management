"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BsDateField } from "@/components/ui/bs-date-field";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { RecordTable, StatusPill } from "@/components/ui/record-table";
import {
  type ActionState,
  addExamTerm,
  editExamTerm,
  removeExamTerm,
  togglePublished,
} from "../actions";

const EMPTY: ActionState = {};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  return null;
}

export type ExamRow = {
  id: number;
  name: string;
  order: number;
  startsBs: string;
  endsBs: string;
  span: string;
  isPublished: boolean;
  marks: number;
};

export function AddExamForm({ academicYearId }: { academicYearId: number }) {
  const [state, action, pending] = useToastedActionState(addExamTerm, EMPTY);
  const [key, setKey] = useState(0);

  return (
    <form
      key={key}
      action={async (data) => {
        await action(data);
        setKey((k) => k + 1);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="exam-name">Exam name</Label>
          <Input id="exam-name" name="name" placeholder="Exam name" required />
        </div>
        <BsDateField id="exam-start" name="startsOn" label="Starts on" help="Optional" />
        <BsDateField id="exam-end" name="endsOn" label="Ends on" help="Optional" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="action" size="xl" disabled={pending}>
          <PlusCircle />
          {pending ? "Adding…" : "Add exam"}
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

function ExamDetail({ row, onDone }: { row: ExamRow; onDone: () => void }) {
  const [editState, editAction, saving] = useToastedActionState(editExamTerm, EMPTY);
  const [, publishAction, publishing] = useToastedActionState(togglePublished, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeExamTerm, EMPTY);

  return (
    <div className="space-y-5">
      <form
        key={`${row.name}-${row.startsBs}-${row.endsBs}`}
        action={editAction}
        className="space-y-4"
      >
        <input type="hidden" name="examTermId" value={row.id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`en-${row.id}`}>Exam name</Label>
            <Input id={`en-${row.id}`} name="name" defaultValue={row.name} required />
          </div>
          <BsDateField
            id={`es-${row.id}`}
            name="startsOn"
            label="Starts on"
            defaultValue={row.startsBs}
            help="Optional"
          />
          <BsDateField
            id={`ee-${row.id}`}
            name="endsOn"
            label="Ends on"
            defaultValue={row.endsBs}
            help="Optional"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium">
          {row.isPublished ? "Published" : "Draft"}
        </p>
        <form action={publishAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="examTermId" value={row.id} />
          <input type="hidden" name="publish" value={row.isPublished ? "0" : "1"} />
          <Button type="submit" variant="outline" disabled={publishing}>
            {row.isPublished ? "Unpublish" : "Publish results"}
          </Button>
          <span className="text-muted-foreground text-xs">
            {row.marks} mark{row.marks === 1 ? "" : "s"} recorded
          </span>
        </form>
        <p className="text-muted-foreground text-xs">
          Publishing locks the marks so a result cannot change after it has been
          shown to anyone. Unpublish to correct one.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={delAction}>
          <input type="hidden" name="examTermId" value={row.id} />
          <ConfirmSubmit label="Delete exam" confirmLabel="Delete?" pending={deleting} />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
        <Status state={delState} />
      </div>
      <p className="text-muted-foreground text-xs">
        Refused while any marks are recorded — that is a term of work, not a typo.
      </p>
    </div>
  );
}

export function ExamsView({ rows }: { rows: ExamRow[] }) {
  return (
    <RecordTable
      title="Exams"
      subtitle="In the order they are sat · click a row to edit"
      rows={rows}
      getKey={(r) => r.id}
      getSearchText={(r) => r.name}
      searchPlaceholder="Search exams"
      empty="No exams yet."
      detailTitle={(r) => r.name}
      filters={[
        {
          key: "state",
          label: "State",
          options: [
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ],
          match: (r, v) => (v === "published" ? r.isPublished : !r.isPublished),
        },
      ]}
      columns={[
        { key: "name", header: "Exam", span: 4, render: (r) => <span className="font-medium">{r.name}</span> },
        {
          key: "span",
          header: "Dates",
          span: 4,
          hideOnMobile: true,
          render: (r) => <span className="tabular-nums">{r.span}</span>,
        },
        {
          key: "marks",
          header: "Marks",
          span: 2,
          render: (r) => <span className="tabular-nums">{r.marks}</span>,
        },
        {
          key: "state",
          header: "State",
          span: 2,
          render: (r) => (
            <StatusPill tone={r.isPublished ? "positive" : "neutral"}>
              {r.isPublished ? "Published" : "Draft"}
            </StatusPill>
          ),
        },
      ]}
      renderDetail={(row, close) => <ExamDetail row={row} onDone={close} />}
    />
  );
}
