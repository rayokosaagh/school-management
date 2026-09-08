"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useState } from "react";
import { Eye, EyeOff, UserPlus, Users } from "lucide-react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordTable, StatusPill, type Tone } from "@/components/ui/record-table";
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

// The role list is the same everywhere it is offered.
const ROLE_OPTIONS = (["ADMIN", "OFFICE", "TEACHER"] as const).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));

const ROLE_TONE: Record<string, Tone> = {
  ADMIN: "critical",
  OFFICE: "positive",
  TEACHER: "neutral",
};

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

/// Teacher permissions are scoped through the staff link, so a teacher account
/// without one can reach nothing at all.
function stranded(account: AccountRow) {
  return account.role === "TEACHER" && account.staffId === null;
}

/// One account's editor, raised as a panel rather than sitting in the row.
/// Two selects and their Save buttons on every row is what made a long list
/// unreadable; the row keeps the values, this holds the controls.
export function AccountEditor({
  account,
  staff,
  isSelf,
}: {
  account: AccountRow;
  staff: StaffOption[];
  isSelf: boolean;
}) {
  const [roleState, roleAction, changingRole] = useToastedActionState(changeAccountRole, EMPTY);
  const [, linkAction, linking] = useToastedActionState(changeStaffLink, EMPTY);
  const [delState, delAction] = useToastedActionState(removeAccount, EMPTY);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">
          {account.username}
          {isSelf ? <span className="text-muted-foreground font-normal"><TranslatedText> · you</TranslatedText></span> : null}
        </p>
        <p className="text-muted-foreground text-xs">
          {account.email ?? "no email"}<TranslatedText> · added </TranslatedText>{account.createdLabel}
        </p>
      </div>

      {stranded(account) ? (
        <p className="text-tint-amber-fg bg-tint-amber rounded-lg px-3 py-2 text-xs"><TranslatedText>
          A teacher account with no staff record can reach nothing. Link one, or
          change the role.
        </TranslatedText></p>
      ) : null}
      {account.email ? null : (
        <p className="text-tint-amber-fg bg-tint-amber rounded-lg px-3 py-2 text-xs"><TranslatedText>
          No email on this account, so there is no way to reach whoever uses it
          if they lose the password.
        </TranslatedText></p>
      )}

      <form action={roleAction} className="space-y-2">
        <input type="hidden" name="userId" value={account.id} />
        <Label htmlFor={`role-${account.id}`}><TranslatedText>Role</TranslatedText></Label>
        <div className="flex items-center gap-2">
          <FieldSelect
            id={`role-${account.id}`}
            name="role"
            defaultValue={account.role}
            options={ROLE_OPTIONS}
            className="h-9 w-full min-w-0 rounded-lg"
          />
          <Button type="submit" variant="outline" size="sm" disabled={changingRole}><TranslatedText>
            Save
          </TranslatedText></Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {ROLE_DESCRIPTION[account.role as keyof typeof ROLE_DESCRIPTION]}
        </p>
      </form>

      <form action={linkAction} className="space-y-2">
        <input type="hidden" name="userId" value={account.id} />
        <Label htmlFor={`staff-${account.id}`}><TranslatedText>Staff record</TranslatedText></Label>
        <div className="flex items-center gap-2">
          <FieldSelect
            id={`staff-${account.id}`}
            name="staffId"
            defaultValue={account.staffId ? String(account.staffId) : ""}
            className="h-9 w-full min-w-0 rounded-lg"
            options={[
              { value: "", label: "Not linked" },
              ...staff
                .filter((s) => !s.taken || s.id === account.staffId)
                .map((s) => ({ value: String(s.id), label: s.fullName })),
            ]}
          />
          <Button type="submit" variant="outline" size="sm" disabled={linking}><TranslatedText>
            Save
          </TranslatedText></Button>
        </div>
      </form>

      {roleState.error ? <p className="text-destructive text-sm">{roleState.error}</p> : null}
      {delState.error ? <p className="text-destructive text-sm">{delState.error}</p> : null}

      {isSelf ? (
        <p className="text-muted-foreground border-t pt-4 text-xs"><TranslatedText>
          You cannot remove the account you are signed in as.
        </TranslatedText></p>
      ) : (
        <form action={delAction} className="border-t pt-4">
          <input type="hidden" name="userId" value={account.id} />
          <ConfirmSubmit label="Remove account" confirmLabel="Remove account?" size="sm" />
        </form>
      )}
    </div>
  );
}

export function Accounts({
  accounts,
  staff,
  currentUserId,
  presetStaffId,
}: {
  accounts: AccountRow[];
  staff: StaffOption[];
  currentUserId: number;
  /** From `?staff=`, set by the staff pane's "Set up sign-in" shortcut. */
  presetStaffId: number | null;
}) {
  const [addState, addAction, adding] = useToastedActionState(addAccount, EMPTY);
  const [visible, setVisible] = useState(false);
  // Arriving from a staff pane means the intent is already "create an account
  // for this person": open the form on them rather than making them find the
  // button and re-pick the name they just clicked. Teacher is the role a staff
  // record almost always wants, and the one `addAccount` requires a link for.
  const [open, setOpen] = useState(presetStaffId !== null);
  const [role, setRole] = useState(presetStaffId !== null ? "TEACHER" : "OFFICE");

  const addForm = open ? (
    <form
      key={accounts.length}
      action={addAction}
      className="space-y-4 rounded-xl border border-dashed p-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="new-username"><TranslatedText>Username</TranslatedText></Label>
          <Input id="new-username" name="username" placeholder="Username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-email"><TranslatedText>Email</TranslatedText></Label>
          <Input id="new-email" name="email" type="email" placeholder="Email address" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password"><TranslatedText>Password</TranslatedText></Label>
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
          <Label htmlFor="new-role"><TranslatedText>Role</TranslatedText></Label>
          <FieldSelect
            id="new-role"
            name="role"
            value={role}
            onValueChange={(next) => setRole(next ?? "OFFICE")}
            options={ROLE_OPTIONS}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="new-staff"><TranslatedText>
            Staff record</TranslatedText><TranslatedText>{" "}</TranslatedText>
            <span className="text-muted-foreground font-normal">
              <TranslatedText>{role === "TEACHER" ? "(required for teachers)" : "(optional)"}</TranslatedText>
            </span>
          </Label>
          <FieldSelect
            id="new-staff"
            name="staffId"
            defaultValue={presetStaffId === null ? "" : String(presetStaffId)}
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
          <TranslatedText>{adding ? "Creating…" : "Create account"}</TranslatedText>
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}><TranslatedText>
          Cancel
        </TranslatedText></Button>
        {addState.error ? <p className="text-destructive text-sm">{addState.error}</p> : null}
      </div>
      <p className="text-muted-foreground text-xs"><TranslatedText>
        Tell the person their password directly and ask them to change it. There
        is no email delivery, and no password reset yet.
      </TranslatedText></p>
    </form>
  ) : (
    <Button type="button" variant="outline" onClick={() => setOpen(true)}>
      <UserPlus /><TranslatedText>
      Add an account
    </TranslatedText></Button>
  );

  return (
    <RecordTable
      icon={Users}
      tint="amber"
      title="Who can sign in"
      subtitle="Public sign-up is closed. What each of them can reach is set below."
      rows={accounts}
      getKey={(a) => a.id}
      // Name, email and the linked staff member are the three things somebody
      // scanning a long list already knows enough to type.
      getSearchText={(a) => `${a.username} ${a.email ?? ""} ${a.staffName ?? ""}`}
      searchPlaceholder="Search accounts"
      empty="No accounts yet."
      filters={[
        { key: "role", label: "Role", options: ROLE_OPTIONS, match: (a, value) => a.role === value },
      ]}
      columns={[
        {
          key: "account",
          header: "Account",
          span: 4,
          render: (a) => (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {a.username}
                {a.id === currentUserId ? (
                  <span className="text-muted-foreground font-normal"><TranslatedText> · you</TranslatedText></span>
                ) : null}
              </p>
              <p className="text-muted-foreground truncate text-xs">{a.email ?? "no email"}</p>
            </div>
          ),
        },
        {
          key: "role",
          header: "Role",
          span: 2,
          render: (a) => (
            <StatusPill tone={ROLE_TONE[a.role] ?? "neutral"}>
              {ROLE_LABEL[a.role as keyof typeof ROLE_LABEL] ?? a.role}
            </StatusPill>
          ),
        },
        {
          key: "staff",
          header: "Staff record",
          span: 3,
          render: (a) =>
            a.staffName ? (
              <span className="truncate">{a.staffName}</span>
            ) : stranded(a) ? (
              <StatusPill tone="warning"><TranslatedText>Reaches nothing</TranslatedText></StatusPill>
            ) : (
              <span className="text-muted-foreground"><TranslatedText>Not linked</TranslatedText></span>
            ),
        },
        {
          key: "added",
          header: "Added",
          span: 3,
          hideOnMobile: true,
          render: (a) => (
            <span className="text-muted-foreground text-xs">
              {a.createdLabel}
              {a.email ? null : " · no reset path"}
            </span>
          ),
        },
      ]}
      rowActions={(a, openRow) => (
        <Button type="button" variant="outline" size="sm" onClick={openRow}><TranslatedText>
          Edit
        </TranslatedText></Button>
      )}
      detailTitle={(a) => `Account · ${a.username}`}
      renderDetail={(a) => (
        <AccountEditor account={a} staff={staff} isSelf={a.id === currentUserId} />
      )}
      footer={addForm}
    />
  );
}
