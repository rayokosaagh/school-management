import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ $transaction: vi.fn(), rolePermission: { deleteMany: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));
import { writeAuditEvent } from "@/lib/audit";
import { resetGrants, setGrant } from "./permissions";
const actor = { userId: 1, username: "admin" };
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((work: (tx: typeof db) => unknown) => work(db));
});
describe("permission audit transactions", () => {
  it.each([true, false])("audits granting/revoking permission (%s), including default restoration", async (allow) => {
    await setGrant("TEACHER", "manage:fees", allow, actor);
    expect(writeAuditEvent).toHaveBeenCalledWith(db, actor, {
      action: "permission.changed", entityType: "RolePermission", entityId: "TEACHER",
      details: { capability: "manage:fees", allowed: allow },
    });
    expect(allow ? db.rolePermission.upsert : db.rolePermission.deleteMany).toHaveBeenCalledOnce();
  });
  it("audits a full reset inside its deletion transaction", async () => {
    await resetGrants(actor);
    expect(db.rolePermission.deleteMany).toHaveBeenCalledWith({});
    expect(writeAuditEvent).toHaveBeenCalledWith(db, actor, {
      action: "permission.reset", entityType: "RolePermission", entityId: "all", details: {},
    });
  });
  it("preserves administrator access without opening a transaction", async () => {
    await expect(setGrant("ADMIN", "manage:settings", false, actor)).rejects.toThrow("always hold every permission");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("propagates audit failures to the transaction", async () => {
    vi.mocked(writeAuditEvent).mockRejectedValueOnce(new Error("Audit unavailable"));
    await expect(resetGrants(actor)).rejects.toThrow("Audit unavailable");
  });
});
