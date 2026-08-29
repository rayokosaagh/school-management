"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
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
      <Link
        href={`/dashboard/teachers/${row.id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ExternalLink className="size-3.5" />
        Open full profile
      </Link>

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

/// Shortcuts on each row: the profile, the editor, and the one status change
/// that gets used often enough to not be worth opening a panel for.
export function TeacherRowActions({ row, open }: { row: StaffRow; open: () => void }) {
  const [, toggleAction, toggling] = useToastedActionState(toggleStaffActive, EMPTY);
  const [, deleteAction, deleting] = useToastedActionState(removeStaff, EMPTY);
  // Deleting is refused server-side while they lead a section or hold a
  // subject; marking them as left is the reversible route.
  const blocked = row.sectionsLed > 0 || row.assignments > 0;

  return (
    <>
      <Button
        render={<Link href={`/dashboard/teachers/${row.id}`} />}
        nativeButton={false}
        variant="ghost"
        size="icon-sm"
        aria-label={`Open ${row.fullName}'s profile`}
        title="Open profile"
      >
        <ExternalLink />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={open}
        aria-label={`Edit ${row.fullName}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <form action={toggleAction} className="contents">
        <input type="hidden" name="staffId" value={row.id} />
        <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={toggling}
          aria-label={row.isActive ? `Mark ${row.fullName} as left` : `Mark ${row.fullName} active`}
          title={row.isActive ? "Mark as left" : "Mark active"}
        >
          {row.isActive ? <UserX /> : <UserCheck />}
        </Button>
      </form>
      {blocked ? (
        // Shown disabled rather than hidden: a missing button reads as a bug,
        // and the reason is what the user actually needs.
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label={`${row.fullName} cannot be deleted`}
          title={`Cannot delete — ${[
            row.sectionsLed > 0 ? `class teacher of ${row.sectionsLed} section${row.sectionsLed === 1 ? "" : "s"}` : null,
            row.assignments > 0 ? `teaches ${row.assignments} subject${row.assignments === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" and ")}. Mark them as left instead.`}
        >
          <Trash2 />
        </Button>
      ) : (
        <form action={deleteAction} className="contents">
          <input type="hidden" name="staffId" value={row.id} />
          <ConfirmSubmit
            icon
            pending={deleting}
            title={`Delete ${row.fullName}`}
            confirmLabel="Delete?"
          />
        </form>
      )}
    </>
  );
}

