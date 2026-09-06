import { beforeEach, describe, expect, it, vi } from "vitest";
import { bsMonthLength, bsToAd } from "@/lib/date/bs";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(), $executeRaw: vi.fn(),
  enrollment: { findFirst: vi.fn() },
  transportRegistration: { upsert: vi.fn(), findMany: vi.fn() },
  feeHead: { findFirst: vi.fn(), upsert: vi.fn() },
  invoice: { createManyAndReturn: vi.fn() },
  invoiceLine: { createMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  academicYear: { findUnique: vi.fn() },
  enrollment: { findMany: vi.fn() },
  transportRegistration: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./fees", () => ({ FeeError: class FeeError extends Error {} }));
import { issueTransport, saveTransportRegistration, transportWorkspace } from "./transport";

const input = { academicYearId: 5, enrollmentId: 20, pickupLocation: "  Kalanki stop  ", monthlyAmount: 1500, startMonth: 1, isActive: true };
const now = bsToAd({ year: 2083, month: 6, day: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((work) => work(tx));
  db.academicYear.findUnique.mockResolvedValue({ nameBS: "2083" });
  tx.enrollment.findFirst.mockResolvedValue({ id: 20 });
  tx.transportRegistration.upsert.mockImplementation(({ create }) => Promise.resolve({ id: 8, ...create }));
  tx.transportRegistration.findMany.mockResolvedValue([
    { id: 8, enrollmentId: 20, monthlyAmount: 1500, pickupLocation: "Kalanki stop" },
    { id: 9, enrollmentId: 21, monthlyAmount: 2200, pickupLocation: "Balaju stop" },
  ]);
  tx.feeHead.findFirst.mockResolvedValue({ id: 6, name: "Transportation" });
  tx.invoice.createManyAndReturn.mockResolvedValue([{ id: 51, transportRegistrationId: 8 }, { id: 52, transportRegistrationId: 9 }]);
});

describe("transport registrations", () => {
  it.each([
    { monthlyAmount: 0 }, { monthlyAmount: 1.5 }, { monthlyAmount: 2_147_483_648 },
    { monthlyAmount: NaN }, { pickupLocation: " " }, { pickupLocation: "x".repeat(161) },
    { startMonth: 0 }, { startMonth: 13 }, { enrollmentId: -1 }, { academicYearId: 0 },
  ])("rejects invalid registration fields before writing: %j", async (invalid) => {
    await expect(saveTransportRegistration({ ...input, ...invalid })).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("checks active enrollment in the selected year before upserting", async () => {
    tx.enrollment.findFirst.mockResolvedValue(null);
    await expect(saveTransportRegistration(input)).rejects.toThrow("active student enrolled in the selected academic year");
    expect(tx.enrollment.findFirst).toHaveBeenCalledWith({ where: { id: 20, academicYearId: 5, student: { status: "ACTIVE" } }, select: { id: true } });
    expect(tx.transportRegistration.upsert).not.toHaveBeenCalled();
  });

  it("locks and upserts one registration per enrollment without modifying old invoices", async () => {
    await saveTransportRegistration(input);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.enrollment.findFirst.mock.invocationCallOrder[0]);
    expect(tx.transportRegistration.upsert).toHaveBeenCalledWith({
      where: { enrollmentId: 20 },
      create: { enrollmentId: 20, pickupLocation: "Kalanki stop", monthlyAmount: 1500, startMonth: 1, isActive: true },
      update: { pickupLocation: "Kalanki stop", monthlyAmount: 1500, startMonth: 1, isActive: true },
    });
    expect(tx.invoice.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.invoiceLine.createMany).not.toHaveBeenCalled();
  });
});

describe("transport monthly billing", () => {
  it("bills only active registered pupils eligible for the selected month", async () => {
    expect(await issueTransport(5, 4, now)).toBe(2);
    const where = tx.transportRegistration.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      isActive: true, startMonth: { lte: 4 },
      enrollment: { academicYearId: 5, student: { status: "ACTIVE" }, enrolledOn: { lte: bsToAd({ year: 2083, month: 4, day: bsMonthLength(2083, 4) }) } },
    });
    const data = tx.invoice.createManyAndReturn.mock.calls[0][0].data;
    expect(data.map((row: { enrollmentId: number }) => row.enrollmentId)).toEqual([20, 21]);
    expect(data[0]).toMatchObject({ academicYearId: 5, transportRegistrationId: 8, periodMonth: 4, dueOn: null });
    expect(data[0].feeStructureId).toBeUndefined();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.transportRegistration.findMany.mock.invocationCallOrder[0]);
  });

  it("copies each registered amount and pickup into immutable invoice lines", async () => {
    await issueTransport(5, 4, now);
    expect(tx.invoiceLine.createMany).toHaveBeenCalledWith({ data: [
      { invoiceId: 51, feeHeadId: 6, description: "Transportation — Kalanki stop", amount: 1500 },
      { invoiceId: 52, feeHeadId: 6, description: "Transportation — Balaju stop", amount: 2200 },
    ] });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("skips legacy transport invoices and cancelled invoices as well as registration bills", async () => {
    tx.transportRegistration.findMany.mockResolvedValue([]);
    expect(await issueTransport(5, 4, now)).toBe(0);
    const exclusion = tx.transportRegistration.findMany.mock.calls[0][0].where.enrollment.invoices.none;
    expect(exclusion).toEqual({ academicYearId: 5, periodMonth: 4, OR: [
      { transportRegistrationId: { not: null } },
      { lines: { some: { feeHead: { billingScope: "TRANSPORT" } } } },
    ] });
    expect(exclusion.status).toBeUndefined();
    expect(tx.invoice.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.feeHead.upsert).not.toHaveBeenCalled();
  });

  it("uses the unique registration/month guard and handles an idempotent retry", async () => {
    tx.invoice.createManyAndReturn.mockResolvedValue([]);
    expect(await issueTransport(5, 4, now)).toBe(0);
    expect(tx.invoice.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(tx.invoiceLine.createMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("creates the designated monthly transport fee head only when needed", async () => {
    tx.feeHead.findFirst.mockResolvedValue(null);
    tx.feeHead.upsert.mockResolvedValue({ id: 6, name: "Transportation" });
    await issueTransport(5, 4, now);
    expect(tx.feeHead.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: "Transportation" },
      create: { name: "Transportation", frequency: "MONTHLY", billingScope: "TRANSPORT" },
      update: { frequency: "MONTHLY", billingScope: "TRANSPORT" },
    }));
  });

  it.each([0, 13, 1.5])("rejects invalid billing month %s", async (month) => {
    await expect(issueTransport(5, month, now)).rejects.toThrow("month from 1 to 12");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("does not issue future-month bills or use a nonexistent year", async () => {
    await expect(issueTransport(5, 7, now)).rejects.toThrow("has not started yet");
    expect(db.$transaction).not.toHaveBeenCalled();
    db.academicYear.findUnique.mockResolvedValue(null);
    await expect(issueTransport(999, 4, now)).rejects.toThrow("existing academic year");
  });
});

describe("transport workspace", () => {
  it("lists active enrollment choices and deduplicates billed legacy months", async () => {
    const enrollment = { id: 20, student: { fullName: "Maya Rai", admissionNo: "S-20" }, section: { name: "A", grade: { name: "Class 5" } } };
    db.enrollment.findMany.mockResolvedValue([enrollment]);
    db.transportRegistration.findMany.mockResolvedValue([{ id: 8, enrollmentId: 20, pickupLocation: "Kalanki stop", monthlyAmount: 1500, startMonth: 1, isActive: true, enrollment: { ...enrollment, invoices: [{ periodMonth: 2 }, { periodMonth: 1 }, { periodMonth: 2 }] } }]);
    const result = await transportWorkspace(5, now);
    expect(result.enrollments).toEqual([{ id: 20, name: "Maya Rai", admissionNo: "S-20", section: "Class 5 A" }]);
    expect(result.registrations[0].billedMonths).toEqual([1, 2]);
    expect(result.months).toHaveLength(12);
    expect(result.months.filter((m) => m.started).map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(db.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: 5, student: { status: "ACTIVE" } } }));
  });
});
