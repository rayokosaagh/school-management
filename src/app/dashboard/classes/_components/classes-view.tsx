"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { ROLL_ORDER_LABEL, type RollOrder } from "@/lib/registry/roll-order";
import { ArrowDown, ArrowDownAZ, ArrowUp, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldSelect } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { RecordTable, StatusPill } from "@/components/ui/record-table";
import {
  type ActionState,
  editAcademicYear,
  editGrade,
  editSection,
  makeYearCurrent,
  removeGrade,
  removeSection,
  renumberSectionRolls,
  reorderSectionRolls,
  reorderGrade,
  tidyGradeOrder,
} from "../actions";

const EMPTY: ActionState = {};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export type YearRow = {
  id: number;
  nameBS: string;
  span: string;
  isCurrent: boolean;
};

export type GradeRow = {
  id: number;
  name: string;
  order: number;
  sectionCount: number;
  studentCount: number;
};

export type SectionRow = {
  id: number;
  name: string;
  gradeId: number;
  gradeName: string;
  classTeacher: string | null;
  classTeacherNp: string | null;
  classTeacherId: number | null;
  students: number;
};

function YearDetail({ row, onDone }: { row: YearRow; onDone: () => void }) {
  const [editState, editAction, saving] = useToastedActionState(editAcademicYear, EMPTY);
  const [curState, curAction] = useToastedActionState(makeYearCurrent, EMPTY);

  return (
    <div className="space-y-5">
      <form key={row.nameBS} action={editAction} className="space-y-3">
        <input type="hidden" name="academicYearId" value={row.id} />
        <div className="space-y-2">
          <Label htmlFor={`yr-${row.id}`}><TranslatedText>Bikram Sambat year</TranslatedText></Label>
          <Input id={`yr-${row.id}`} name="nameBS" defaultValue={row.nameBS} inputMode="numeric" />
        </div>
        <p className="text-muted-foreground text-xs"><TranslatedText>
          Renaming re-derives the Gregorian span, currently </TranslatedText>{row.span}.
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            <TranslatedText>{saving ? "Saving…" : "Save"}</TranslatedText>
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        {row.isCurrent ? (
          <StatusPill tone="positive"><TranslatedText>Current year</TranslatedText></StatusPill>
        ) : (
          <form action={curAction}>
            <input type="hidden" name="academicYearId" value={row.id} />
            <Button type="submit" variant="outline"><TranslatedText>
              Make current
            </TranslatedText></Button>
          </form>
        )}
        <Button type="button" variant="ghost" onClick={onDone}><TranslatedText>
          Close
        </TranslatedText></Button>
      </div>
      <Status state={curState} />
    </div>
  );
}

export function GradeDetail({ row, onDone }: { row: GradeRow; onDone: () => void }) {
  const [editState, editAction, saving] = useToastedActionState(editGrade, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeGrade, EMPTY);

  return (
    <div className="space-y-5">
      <form key={`${row.name}-${row.order}`} action={editAction} className="space-y-4">
        <input type="hidden" name="gradeId" value={row.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`gn-${row.id}`}><TranslatedText>Grade name</TranslatedText></Label>
            <Input id={`gn-${row.id}`} name="name" defaultValue={row.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`go-${row.id}`}><TranslatedText>Order</TranslatedText></Label>
            <Input id={`go-${row.id}`} name="order" defaultValue={row.order} inputMode="numeric" required />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            <TranslatedText>{saving ? "Saving…" : "Save changes"}</TranslatedText>
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={delAction}>
          <input type="hidden" name="gradeId" value={row.id} />
          <ConfirmSubmit label="Delete grade" confirmLabel="Delete?" pending={deleting} />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}><TranslatedText>
          Close
        </TranslatedText></Button>
        <Status state={delState} />
      </div>
      <p className="text-muted-foreground text-xs"><TranslatedText>
        Order drives sorting and year-end promotion. Deleting is blocked while the
        grade has sections or offerings.
      </TranslatedText></p>
    </div>
  );
}

export function SectionDetail({
  row,
  exams,
  onDone,
}: {
  row: SectionRow;
  /// Exams for this year, so a roll can be ranked by one of them.
  exams: { id: number; name: string }[];
  onDone: () => void;
}) {
  const [editState, editAction, saving] = useToastedActionState(editSection, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeSection, EMPTY);
  const [, renumberAction, renumbering] = useToastedActionState(
    renumberSectionRolls,
    EMPTY,
  );
  const [reorderState, reorderAction, reordering] = useToastedActionState(
    reorderSectionRolls,
    EMPTY,
  );
  const [order, setOrder] = useState<RollOrder>("ALPHABETICAL");

  return (
    <div className="space-y-5">
      <form key={row.name} action={editAction} className="space-y-3">
        <input type="hidden" name="sectionId" value={row.id} />
        <div className="space-y-2">
          <Label htmlFor={`sn-${row.id}`}><TranslatedText>Section name</TranslatedText></Label>
          <Input id={`sn-${row.id}`} name="name" defaultValue={row.name} maxLength={4} required />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            <TranslatedText>{saving ? "Saving…" : "Save"}</TranslatedText>
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium"><TranslatedText>Roll numbers</TranslatedText></p>
        <form action={renumberAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="sectionId" value={row.id} />
          <Button type="submit" variant="outline" disabled={renumbering || row.students === 0}>
            <ListOrdered />
            <TranslatedText>{renumbering ? "Renumbering…" : "Close gaps"}</TranslatedText>
          </Button>
          <span className="text-muted-foreground text-xs">
            {row.students}<TranslatedText> enrolled
          </TranslatedText></span>
        </form>
        <p className="text-muted-foreground text-xs"><TranslatedText>
          Renumbers this section 1 to </TranslatedText>{row.students || "n"}<TranslatedText>, keeping the current
          order. Moves and deletions already close their own gaps; this is for
          rolls that drifted before that.
        </TranslatedText></p>

        <form action={reorderAction} className="border-line space-y-2 border-t pt-4">
          <p className="text-sm font-medium"><TranslatedText>Reissue in a different order</TranslatedText></p>
          <input type="hidden" name="sectionId" value={row.id} />
          <div className="flex flex-wrap items-end gap-2">
            <FieldSelect
              name="order"
              aria-label="Roll order"
              value={order}
              onValueChange={(next) => setOrder((next as RollOrder) ?? "ALPHABETICAL")}
              className="h-9 w-56"
              options={(Object.keys(ROLL_ORDER_LABEL) as RollOrder[]).map((key) => ({
                value: key,
                label: ROLL_ORDER_LABEL[key],
              }))}
            />
            {order === "MARKS" ? (
              <FieldSelect
                name="examTermId"
                aria-label="Exam to rank by"
                defaultValue={exams[0] ? String(exams[0].id) : undefined}
                className="h-9 w-48"
                placeholder="Choose an exam"
                options={exams.map((e) => ({ value: String(e.id), label: e.name }))}
              />
            ) : null}
            <Button type="submit" variant="outline" disabled={reordering || row.students === 0}>
              <ArrowDownAZ />
              <TranslatedText>{reordering ? "Reissuing…" : "Reissue"}</TranslatedText>
            </Button>
          </div>
          <Status state={reorderState} />
          <p className="text-muted-foreground text-xs">
            <TranslatedText>{order === "MARKS" && exams.length === 0
              ? "No exams exist for this year yet, so there is nothing to rank by."
              : "Every student is given a new roll number in this order. The class teacher of this section can do this too."}</TranslatedText>
          </p>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={delAction}>
          <input type="hidden" name="sectionId" value={row.id} />
          <ConfirmSubmit label="Delete section" confirmLabel="Delete?" pending={deleting} />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}><TranslatedText>
          Close
        </TranslatedText></Button>
        <Status state={delState} />
      </div>
      <p className="text-muted-foreground text-xs"><TranslatedText>
        The class teacher is set in the list behind this panel. Deleting is
        blocked while students are enrolled.
      </TranslatedText></p>
    </div>
  );
}

export function YearsView({ rows }: { rows: YearRow[] }) {
  return (
    <RecordTable
      title="Academic years"
      subtitle="Sections and enrolments belong to a year · click a row to edit"
      rows={rows}
      getKey={(r) => r.id}
      empty="No academic year yet."
      detailTitle={(r) => `Academic year ${r.nameBS}`}
      columns={[
        { key: "name", header: "Year", span: 3, render: (r) => <span className="font-medium tabular-nums">{r.nameBS}</span> },
        { key: "span", header: "Gregorian span", span: 6, render: (r) => <span className="text-muted-foreground tabular-nums">{r.span}</span> },
        {
          key: "cur",
          header: "State",
          span: 3,
          render: (r) =>
            r.isCurrent ? (
              <StatusPill tone="positive"><TranslatedText>Current</TranslatedText></StatusPill>
            ) : (
              <StatusPill><TranslatedText>Past</TranslatedText></StatusPill>
            ),
        },
      ]}
      renderDetail={(row, close) => <YearDetail row={row} onDone={close} />}
    />
  );
}

function MoveGradeButtons({ gradeId, isFirst, isLast }: {
  gradeId: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [, action, pending] = useToastedActionState(reorderGrade, EMPTY);

  return (
    // Stops the click bubbling into the row, which would open the edit dialog.
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form action={action}>
        <input type="hidden" name="gradeId" value={gradeId} />
        <input type="hidden" name="direction" value="up" />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={pending || isFirst}
          aria-label="Move up"
        >
          <ArrowUp />
        </Button>
      </form>
      <form action={action}>
        <input type="hidden" name="gradeId" value={gradeId} />
        <input type="hidden" name="direction" value="down" />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={pending || isLast}
          aria-label="Move down"
        >
          <ArrowDown />
        </Button>
      </form>
    </div>
  );
}

function TidyOrderButton() {
  const [, action, pending] = useToastedActionState(tidyGradeOrder, EMPTY);
  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <ListOrdered />
        <TranslatedText>{pending ? "Renumbering…" : "Renumber"}</TranslatedText>
      </Button>
    </form>
  );
}

export function GradesView({ rows }: { rows: GradeRow[] }) {
  const ordered = [...rows].sort((a, b) => a.order - b.order);
  return (
    <RecordTable
      title="Grades"
      subtitle="Lowest first · use the arrows to reorder, click a row to edit"
      rows={ordered}
      actions={<TidyOrderButton />}
      getKey={(r) => r.id}
      getSearchText={(r) => r.name}
      searchPlaceholder="Grade"
      empty="No grades yet."
      detailTitle={(r) => r.name}
      columns={[
        {
          key: "move",
          header: "Order",
          span: 2,
          render: (r) => (
            <MoveGradeButtons
              gradeId={r.id}
              isFirst={ordered[0]?.id === r.id}
              isLast={ordered[ordered.length - 1]?.id === r.id}
            />
          ),
        },
        { key: "name", header: "Grade", span: 5, render: (r) => <span className="font-medium">{r.name}</span> },
        {
          key: "sections",
          header: "Sections",
          span: 2,
          render: (r) => <span className="tabular-nums">{r.sectionCount}</span>,
        },
        {
          key: "students",
          header: "Students",
          span: 3,
          render: (r) => <span className="tabular-nums">{r.studentCount}</span>,
        },
      ]}
      renderDetail={(row, close) => <GradeDetail row={row} onDone={close} />}
    />
  );
}

