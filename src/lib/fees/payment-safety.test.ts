import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  invoice: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  payment: { create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  paymentAllocation: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));
import { writeAuditEvent } from "@/lib/audit";
import { recordPayment } from "./fees";

const allocation = (amount: number, status = "COMPLETED") => ({ amount, payment: { status } });
const input = { invoiceId: 12, amount: 250, method: "CASH" as const };
const invoice = () => ({
  id: 12, academicYearId: 4, status: "PARTIAL",
  lines: [
    { id: 21, amount: 500, allocations: [allocation(400)] },
    { id: 22, amount: 300, allocations: [] },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((work: (tx: typeof db) => unknown) => work(db));
  db.$queryRaw.mockResolvedValue([{ id: 12 }]);
  db.invoice.findUniqueOrThrow.mockResolvedValue(invoice());
  db.payment.create.mockResolvedValue({ id: 9 });
  db.payment.update.mockResolvedValue({ id: 9, receiptNo: "RCT-4-00009" });
});

describe("payment safety", () => {
  const requestKey = "a905fdee-f2c0-43b7-8867-43b3c3d8e414";
  it("returns the original receipt on a same-request retry before looking up the now-paid balance", async () => {
    const fingerprint = createHash("sha256").update(JSON.stringify({ invoiceId: 12, amount: 250, method: "CASH", reference: null, paidByGuardianId: null, paidByName: null, paidByPhone: null })).digest("hex");
    db.$queryRaw.mockResolvedValueOnce([{ id: 12 }]).mockResolvedValueOnce([{ paymentId: 9, fingerprint }]);
    db.payment.findUniqueOrThrow.mockResolvedValue({ id: 9, receiptNo: "RCT-4-00009" });
    await expect(recordPayment({ ...input, requestKey })).resolves.toMatchObject({ id: 9 });
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.invoice.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });
  it("refuses to reuse a payment key for altered details", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: 12 }]).mockResolvedValueOnce([{ paymentId: 9, fingerprint: "different" }]);
    await expect(recordPayment({ ...input, requestKey })).rejects.toThrow("different details");
    expect(db.payment.create).not.toHaveBeenCalled();
  });
  it("stores the request mapping inside the payment transaction without payer plaintext", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: 12 }]).mockResolvedValueOnce([]);
    await recordPayment({ ...input, requestKey, paidByName: "Private payer" });
    expect(db.$executeRaw).toHaveBeenCalledOnce();
    expect(db.$executeRaw.mock.calls[0][0].join("?")).toContain('INSERT INTO "PaymentRequest"');
    expect(db.$executeRaw.mock.calls[0].slice(1)).toEqual([requestKey, 9, expect.stringMatching(/^[a-f0-9]{64}$/)]);
    expect(JSON.stringify(db.$executeRaw.mock.calls)).not.toContain("Private payer");
  });
  it("rejects malformed retry tokens before opening a transaction", async () => {
    await expect(recordPayment({ ...input, requestKey: "bad-key" })).rejects.toThrow("request is invalid");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("locks the invoice before reading its balance and requests deterministic oldest-line order", async () => {
    await recordPayment(input);
    expect(db.$queryRaw.mock.calls[0][0].join("?")).toContain("FOR UPDATE");
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.invoice.findUniqueOrThrow.mock.invocationCallOrder[0]);
    expect(db.invoice.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      include: { lines: expect.objectContaining({ orderBy: { id: "asc" } }) },
    }));
  });

  it("allocates a partial payment without exceeding a line balance", async () => {
    await expect(recordPayment(input)).resolves.toEqual({ id: 9, receiptNo: "RCT-4-00009" });
    expect(db.paymentAllocation.createMany).toHaveBeenCalledWith({ data: [
      { paymentId: 9, invoiceLineId: 21, amount: 100 },
      { paymentId: 9, invoiceLineId: 22, amount: 150 },
    ] });
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { status: "PARTIAL" } });
    expect(db.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ academicYearId: 4, amount: 250 }) }));
  });

  it("marks the invoice paid only when its full remaining balance is received", async () => {
    await recordPayment({ ...input, amount: 400 });
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { status: "PAID" } });
  });

  it("records the actor and payment details using the same transaction", async () => {
    const actor = { userId: 3, username: "clerk" };
    await recordPayment(input, actor);
    expect(writeAuditEvent).toHaveBeenCalledWith(db, actor, {
      action: "payment.recorded", entityType: "Payment", entityId: 9, academicYearId: 4,
      details: { invoiceId: 12, amount: 250, method: "CASH" },
    });
  });

  it("does not silently succeed if the transactional audit fails", async () => {
    vi.mocked(writeAuditEvent).mockRejectedValueOnce(new Error("Audit unavailable"));
    await expect(recordPayment(input, { userId: 3, username: "clerk" })).rejects.toThrow("Audit unavailable");
  });

  it("reversed allocations do not settle any of the outstanding balance", async () => {
    const bill = invoice();
    bill.lines[0].allocations.push(allocation(100, "REVERSED"));
    db.invoice.findUniqueOrThrow.mockResolvedValue(bill);
    await recordPayment({ ...input, amount: 400 });
    expect(db.paymentAllocation.createMany).toHaveBeenCalledWith({ data: [
      { paymentId: 9, invoiceLineId: 21, amount: 100 },
      { paymentId: 9, invoiceLineId: 22, amount: 300 },
    ] });
  });

  it("rejects overpayment before creating a receipt or allocations", async () => {
    await expect(recordPayment({ ...input, amount: 401 })).rejects.toThrow("remains on this invoice");
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.paymentAllocation.createMany).not.toHaveBeenCalled();
  });

  it("rejects a duplicate full payment after the first payment settled the invoice", async () => {
    const bill = invoice();
    bill.lines[0].allocations.push(allocation(100));
    bill.lines[1].allocations.push(allocation(300));
    db.invoice.findUniqueOrThrow.mockResolvedValue({ ...bill, status: "PAID" });
    await expect(recordPayment(input)).rejects.toThrow("already settled");
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("rejects cancelled invoices even when their lines still have balances", async () => {
    db.invoice.findUniqueOrThrow.mockResolvedValue({ ...invoice(), status: "CANCELLED" });
    await expect(recordPayment(input)).rejects.toThrow("cannot receive a payment");
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a missing invoice before looking up lines", async () => {
    db.$queryRaw.mockResolvedValue([]);
    await expect(recordPayment(input)).rejects.toThrow("cannot receive a payment");
    expect(db.invoice.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid rupee amount %s before opening a transaction", async (amount) => {
    await expect(recordPayment({ ...input, amount })).rejects.toThrow("whole number");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
