import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("../actions", () => ({
  addAccount: vi.fn(), changeAccountRole: vi.fn(),
  changeStaffLink: vi.fn(), removeAccount: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ useToastedActionState: () => [{}, () => {}, false] }));

import { AccountEditor, Accounts, type AccountRow } from "./accounts";

const STAFF = [
  { id: 40, fullName: "Deepak Karki", fullNameNp: null, taken: false },
  { id: 13, fullName: "Sita Sharma", fullNameNp: "सीता शर्मा", taken: true },
];

function account(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 2, username: "sita", email: "sita@local.com", role: "TEACHER",
    createdLabel: "29 Aug 2026", staffId: 13, staffName: "Sita Sharma", staffNameNp: "सीता शर्मा", ...over,
  };
}

function render(presetStaffId: number | null, accounts: AccountRow[] = []) {
  return renderToStaticMarkup(
    createElement(Accounts, { accounts, staff: STAFF, currentUserId: 1, presetStaffId }),
  );
}

function editor(over: Partial<AccountRow> = {}, isSelf = false) {
  return renderToStaticMarkup(
    createElement(AccountEditor, { account: account(over), staff: STAFF, isSelf }),
  );
}

describe("arriving from a staff pane", () => {
  it("opens the new-account form on the staff member named in the link", () => {
    const html = render(40);
    expect(html).toContain("Deepak Karki");
    // The password field only exists once the form is open.
    expect(html).toContain("At least 8 characters");
  });

  it("defaults that account to the least-privileged role", () => {
    // Teacher is the narrowest role and the one addAccount requires a staff
    // link for. Guessing wrong here under-grants, which is the safe direction.
    const html = render(40);
    expect(html).toContain("(required for teachers)");
  });

  it("leaves the form collapsed when Settings is opened on its own", () => {
    const html = render(null);
    expect(html).not.toContain("At least 8 characters");
  });
});

describe("the accounts table", () => {
  it("carries the columns that make a long list scannable", () => {
    const html = render(null, [account()]);
    for (const header of ["Account", "Role", "Staff record", "Added"]) {
      expect(html).toContain(header);
    }
    // Search and the role filter are the point of the table at 30+ accounts.
    expect(html).toContain("Search accounts");
    expect(html).toContain("Role: all");
  });

  it("shows the role as a value rather than a control on every row", () => {
    const html = render(null, [account({ role: "ADMIN" })]);
    expect(html).toContain("Administrator");
    // The editing selects belong to the panel, not the row.
    expect(html).not.toContain('name="role"');
  });

  it("marks a teacher account that is linked to nobody", () => {
    const html = render(null, [account({ staffId: null, staffName: null })]);
    expect(html).toContain("Reaches nothing");
  });

  it("marks an account with no email as having no way back in", () => {
    const html = render(null, [account({ email: null })]);
    expect(html).toContain("no reset path");
  });

  it("offers every row its editor", () => {
    const html = render(null, [account()]);
    expect(html).toContain("Edit");
  });
});

describe("the row editor", () => {
  it("offers the role and staff-record controls", () => {
    const html = editor();
    expect(html).toContain('name="role"');
    expect(html).toContain('name="staffId"');
  });

  it("explains why a teacher with no staff record is useless", () => {
    const html = editor({ staffId: null, staffName: null });
    expect(html).toContain("can reach nothing");
  });

  it("does not offer to remove the account you are signed in as", () => {
    expect(editor({}, true)).not.toContain("Remove account");
    expect(editor({}, true)).toContain("cannot remove the account you are signed in as");
    expect(editor({}, false)).toContain("Remove account");
  });
});
