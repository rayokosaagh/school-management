"use client";

import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { type ActionState, assignSubjectTeacher } from "../actions";
import { FieldSelect } from "@/components/ui/select";

const EMPTY: ActionState = {};

export function SubjectTeacherRow({
  sectionId,
  offering,
  assignedId,
  staff,
}: {
  sectionId: number;
  offering: { id: number; subjectName: string; subjectCode: string; hasPractical: boolean };
  assignedId: number | null;
  staff: { id: number; fullName: string }[];
}) {
  const [state, action, pending] = useToastedActionState(assignSubjectTeacher, EMPTY);

  return (
    <form
      action={action}
      className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 py-2"
    >
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="subjectOfferingId" value={offering.id} />

      <div className="text-sm">
        <span className="font-medium">{offering.subjectName}</span>
        <span className="text-muted-foreground"> · {offering.subjectCode}</span>
        {offering.hasPractical ? (
          <span className="text-muted-foreground"> · practical</span>
        ) : null}
      </div>

      <FieldSelect
        name="staffId"
        defaultValue={assignedId ? String(assignedId) : ""}
        aria-label={`Teacher for ${offering.subjectName}`}
        options={[
          { value: "", label: "Not assigned" },
          ...staff.map((s) => ({ value: String(s.id), label: s.fullName })),
        ]}
      />

      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.error ? (
          <span className="text-destructive text-xs">{state.error}</span>
        ) : null}
        {state.success ? (
          <span className="text-muted-foreground text-xs">{state.success}</span>
        ) : null}
      </div>
    </form>
  );
}
