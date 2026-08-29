"use client";

import { useToastedActionState } from "@/components/ui/toast";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameFields } from "@/components/ui/name-fields";
import { BsDateField } from "@/components/ui/bs-date-field";
import { type ActionState, addStaff } from "../actions";

const EMPTY: ActionState = {};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export function AddStaffForm() {
  const [state, action, pending] = useToastedActionState(addStaff, EMPTY);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NameFields idPrefix="staff-" />
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="Mobile number" inputMode="tel" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="designation">Designation</Label>
          <Input id="designation" name="designation" placeholder="Job title" required />
        </div>
        <BsDateField id="joinedOn" name="joinedOn" label="Joined on" required />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="action" size="xl" disabled={pending}>
          <PlusCircle />
          {pending ? "Adding…" : "Add staff"}
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

