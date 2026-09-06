import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { writeAuditEvent } from "./audit";

describe("transactional audit", () => {
  const event = { action: "payment.recorded", entityType: "Payment", entityId: 8, details: { amount: 500 } };
  it("binds values rather than interpolating actor text into SQL", async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    await writeAuditEvent(tx, { userId: 2, username: "O'Reilly" }, event);
    const [query, ...params] = tx.$executeRaw.mock.calls[0];
    expect(query.join("?")).not.toContain("O'Reilly");
    expect(params).toContain("O'Reilly");
    expect(params).toContain('{"amount":500}');
  });
  it("rejects missing actors before writing", async () => {
    const tx = { $executeRaw: vi.fn() };
    await expect(writeAuditEvent(tx, { userId: 0, username: "" }, event)).rejects.toThrow("authenticated actor");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("propagates write failure to roll back the owning mutation", async () => {
    const tx = { $executeRaw: vi.fn().mockRejectedValue(new Error("unavailable")) };
    await expect(writeAuditEvent(tx, { userId: 2, username: "office" }, event)).rejects.toThrow("unavailable");
  });
});
