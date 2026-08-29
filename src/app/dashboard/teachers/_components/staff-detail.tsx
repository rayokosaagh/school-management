"use client";

import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameFields } from "@/components/ui/name-fields";
import { BsDateField } from "@/components/ui/bs-date-field";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  type ActionState,
  editStaff,
  removeStaff,
  toggleStaffActive,
} from "../actions";

const EMPTY: ActionState = {};

export type StaffRow = {
  id: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  phone: string;
  designation: string;
  joinedOnBs: string;
  joinedLabel: string;
  isActive: boolean;
  sectionsLed: number;
  assignments: number;
};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export function StaffDetail({ row, onDone }: { row: StaffRow; onDone: () => void }) {
  const [editState, editAction, saving] = useToastedActionState(editStaff, EMPTY);
  const [toggleState, toggleAction] = useToastedActionState(toggleStaffActive, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeStaff, EMPTY);

  const signature = [
    row.fullName,
    row.fullNameNp,
    row.phone,
    row.designation,
    row.joinedOnBs,
    row.middleName,
  ].join("|");

  return (
    <div className="space-y-5">
      <form key={signature} action={editAction} className="space-y-4">
        <input type="hidden" name="staffId" value={row.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NameFields
            idPrefix={`t${row.id}-`}
            firstName={row.firstName}
            middleName={row.middleName ?? ""}
            lastName={row.lastName}
            fullNameNp={row.fullNameNp ?? ""}
          />
          <div className="space-y-2">
            <Label htmlFor={`sp-${row.id}`}>Phone</Label>
            <Input id={`sp-${row.id}`} name="phone" defaultValue={row.phone} inputMode="tel" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`sd-${row.id}`}>Designation</Label>
            <Input id={`sd-${row.id}`} name="designation" defaultValue={row.designation} required />
          </div>
          <BsDateField
            id={`sj-${row.id}`}
            name="joinedOn"
            label="Joined on"
            defaultValue={row.joinedOnBs}
            required
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={toggleAction}>
          <input type="hidden" name="staffId" value={row.id} />
          <input type="hidden" name="isActive" value={String(!row.isActive)} />
          <Button type="submit" variant="outline">
            {row.isActive ? "Mark as left" : "Reinstate"}
          </Button>
        </form>
        <form action={delAction}>
          <input type="hidden" name="staffId" value={row.id} />
          <ConfirmSubmit label="Delete" confirmLabel="Delete permanently?" pending={deleting} />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
      <Status state={toggleState} />
      <Status state={delState} />
      <p className="text-muted-foreground text-xs">
        Deleting is blocked while the person is a class teacher or holds a subject.
        Marking them as left keeps their history intact.
      </p>
    </div>
  );
}
