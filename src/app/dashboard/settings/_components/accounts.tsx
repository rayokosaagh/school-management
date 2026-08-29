"use client";

import { useState } from "react";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill, type Tone } from "@/components/ui/record-table";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/roles";
import { FieldSelect } from "@/components/ui/select";
import {
  type AccountState,
  addAccount,
  changeAccountRole,
  changeStaffLink,
  removeAccount,
} from "../actions";

const EMPTY: AccountState = {};

const ROLE_TONE: Record<string, Tone> = {
  ADMIN: "critical",
  OFFICE: "positive",
  TEACHER: "neutral",
};

// The role list is the same everywhere it is offered.
const ROLE_OPTIONS = (["ADMIN", "OFFICE", "TEACHER"] as const).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));

// Inline dropdowns sit in a row of controls, so they stay compact.
const inlineSelect = "h-9 w-auto rounded-lg";

export type AccountRow = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  createdLabel: string;
  staffId: number | null;
  staffName: string | null;
};

export type StaffOption = { id: number; fullName: string; taken: boolean };

function AccountRowItem({
  account,
  staff,
  isSelf,
}: {
  account: AccountRow;
  staff: StaffOption[];
  isSelf: boolean;
}) {
  const [roleState, roleAction, changingRole] = useToastedActionState(
    changeAccountRole,
    EMPTY,
  );
  const [, linkAction, linking] = useToastedActionState(changeStaffLink, EMPTY);
  const [delState, delAction] = useToastedActionState(removeAccount, EMPTY);

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {account.username}
            {isSelf ? (
              <span className="text-muted-foreground font-normal"> · you</span>
            ) : null}
          </p>
          <p className="text-muted-foreground text-xs">
            {account.email ?? "no email"} · added {account.createdLabel}
          </p>
        </div>
        <StatusPill tone={ROLE_TONE[account.role] ?? "neutral"}>
          {ROLE_LABEL[account.role as keyof typeof ROLE_LABEL] ?? account.role}
        </StatusPill>
        {account.email ? null : <StatusPill tone="warning">No reset path</StatusPill>}
        {isSelf ? null : (
          <form action={delAction}>
            <input type="hidden" name="userId" value={account.id} />
            <ConfirmSubmit label="Remove" confirmLabel="Remove account?" size="sm" />
          </form>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={account.id} />
          <Label htmlFor={`role-${account.id}`} className="text-xs">
            Role
          </Label>
          <FieldSelect
            id={`role-${account.id}`}
            name="role"
            defaultValue={account.role}
            options={ROLE_OPTIONS}
            className={inlineSelect}
          />
          <Button type="submit" variant="outline" size="sm" disabled={changingRole}>
            Save
          </Button>
        </form>

        <form action={linkAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={account.id} />
          <Label htmlFor={`staff-${account.id}`} className="text-xs">
            Staff record
          </Label>
          <FieldSelect
            id={`staff-${account.id}`}
            name="staffId"
            defaultValue={account.staffId ? String(account.staffId) : ""}
            className={inlineSelect}
            options={[
              { value: "", label: "Not linked" },
              ...staff
                .filter((s) => !s.taken || s.id === account.staffId)
                .map((s) => ({ value: String(s.id), label: s.fullName })),
            ]}
          />
          <Button type="submit" variant="outline" size="sm" disabled={linking}>
            Save
          </Button>
        </form>
      </div>

      {account.role === "TEACHER" && account.staffId === null ? (
        <p className="text-tint-amber-fg bg-tint-amber rounded-lg px-3 py-2 text-xs">
          A teacher account with no staff record can reach nothing. Link one, or
          change the role.
        </p>
      ) : null}
      {roleState.error ? (
        <p className="text-destructive text-sm">{roleState.error}</p>
      ) : null}
      {delState.error ? (
        <p className="text-destructive text-sm">{delState.error}</p>
      ) : null}
    </li>
  );
}

export function Accounts({
  accounts,
  staff,
  currentUserId,
}: {
  accounts: AccountRow[];
  staff: StaffOption[];
  currentUserId: number;
}) {
  const [addState, addAction, adding] = useToastedActionState(addAccount, EMPTY);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("OFFICE");

  return (
    <div className="space-y-5">
      <ul className="divide-y">
        {accounts.map((account) => (
          <AccountRowItem
            key={account.id}
            account={account}
            staff={staff}
            isSelf={account.id === currentUserId}
          />
        ))}
      </ul>

      {open ? (
        <form
          key={accounts.length}
          action={addAction}
          className="space-y-4 rounded-xl border border-dashed p-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" name="username" placeholder="Username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input id="new-email" name="email" type="email" placeholder="Email address" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  name="password"
                  type={visible ? "text" : "password"}
                  placeholder="At least 8 characters"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <FieldSelect
                id="new-role"
                name="role"
                value={role}
                onValueChange={(next) => setRole(next ?? "OFFICE")}
                options={ROLE_OPTIONS}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="new-staff">
                Staff record{" "}
                <span className="text-muted-foreground font-normal">
                  {role === "TEACHER" ? "(required for teachers)" : "(optional)"}
                </span>
              </Label>
              <FieldSelect
                id="new-staff"
                name="staffId"
                defaultValue=""
                required={role === "TEACHER"}
                options={[
                  { value: "", label: "Not linked" },
                  ...staff
                    .filter((s) => !s.taken)
                    .map((s) => ({ value: String(s.id), label: s.fullName })),
                ]}
              />
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            {ROLE_DESCRIPTION[role as keyof typeof ROLE_DESCRIPTION]}
          </p>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={adding}>
              {adding ? "Creating…" : "Create account"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {addState.error ? (
              <p className="text-destructive text-sm">{addState.error}</p>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            Tell the person their password directly and ask them to change it.
            There is no email delivery, and no password reset yet.
          </p>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <UserPlus />
          Add an account
        </Button>
      )}
    </div>
  );
}
