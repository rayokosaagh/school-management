import { beforeEach, describe, expect, it, vi } from "vitest";
import { bsToAd } from "@/lib/date/bs";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(), $executeRaw: vi.fn(),
  academicYear: { findUnique: vi.fn() },
  feeHead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  studentFeePlan: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  enrollment: { findMany: vi.fn() },
  studentFeeAssignment: { updateMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  invoice: { createManyAndReturn: vi.fn() }, invoiceLine: { createMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(), academicYear: { findUnique: vi.fn() },
  studentFeePlan: { findMany: vi.fn() }, feeHead: { findMany: vi.fn() }, invoice: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./fees", () => ({ FeeError: class FeeError extends Error {} }));
import { createStudentFeePlan, issueStudentFeePlan, saveStudentFeePlan, studentFeeWorkspace } from "./student-fees";

const create = { academicYearId: 5, name: "Library", frequency: "MONTHLY" as const, amount: 500, convertClassFee: false };
const head = { id: 8, name: "Library", frequency: "MONTHLY", isActive: true, billingScope: "STUDENT" };
const plan = { id: 3, academicYearId: 5, feeHeadId: 8, amount: 500, isActive: true, feeHead: head, academicYear: { nameBS: "2083" } };
const save = { academicYearId: 5, planId: 3, amount: 600, isActive: true, enrollmentIds: [20, 21] };
const now = bsToAd({ year: 2083, month: 6, day: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((work) => work(tx));
  tx.academicYear.findUnique.mockResolvedValue({ id: 5 });
  tx.feeHead.findFirst.mockResolvedValue(null);
  tx.feeHead.create.mockResolvedValue(head);
  tx.feeHead.update.mockResolvedValue(head);
  tx.studentFeePlan.findUnique.mockResolvedValue(null);
  tx.studentFeePlan.findFirst.mockResolvedValue(plan);
  tx.studentFeePlan.create.mockResolvedValue(plan);
  tx.studentFeePlan.update.mockResolvedValue(plan);
  tx.enrollment.findMany.mockResolvedValue([{ id: 20 }, { id: 21 }]);
  tx.studentFeeAssignment.findMany.mockResolvedValue([{ id: 40, enrollmentId: 20 }, { id: 41, enrollmentId: 21 }]);
  tx.invoice.createManyAndReturn.mockResolvedValue([{ id: 60 }, { id: 61 }]);
});

describe("create selected-student fee plans", () => {
  it("creates a student-only head and year plan", async () => {
    await createStudentFeePlan({ ...create, name: "  Library  " });
    expect(tx.feeHead.create).toHaveBeenCalledWith({ data: { name: "Library", frequency: "MONTHLY", billingScope: "STUDENT" } });
    expect(tx.studentFeePlan.create).toHaveBeenCalledWith({ data: { academicYearId: 5, feeHeadId: 8, amount: 500 } });
  });

  it("reuses a matching head case-insensitively without renaming it", async () => {
    tx.feeHead.findFirst.mockResolvedValue(head);
    await createStudentFeePlan({ ...create, name: "library" });
    expect(tx.feeHead.findFirst).toHaveBeenCalledWith({ where: { name: { equals: "library", mode: "insensitive" } }, orderBy: { id: "asc" } });
    expect(tx.feeHead.create).not.toHaveBeenCalled();
    expect(tx.feeHead.update).not.toHaveBeenCalled();
  });

  it("requires explicit conversion and changes only the class head's billing scope", async () => {
    tx.feeHead.findFirst.mockResolvedValue({ ...head, billingScope: "CLASS" });
    await expect(createStudentFeePlan(create)).rejects.toThrow("Confirm conversion");
    expect(tx.feeHead.update).not.toHaveBeenCalled();
    await createStudentFeePlan({ ...create, convertClassFee: true });
    expect(tx.feeHead.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { billingScope: "STUDENT" } });
    expect(tx.invoiceLine.createMany).not.toHaveBeenCalled();
  });

  it.each([
    [{ billingScope: "TRANSPORT" }, "transport registrations"],
    [{ frequency: "ONE_TIME" }, "frequency must match"],
    [{ isActive: false }, "Activate this fee type"],
  ])("does not convert an incompatible existing fee: %j", async (change, message) => {
    tx.feeHead.findFirst.mockResolvedValue({ ...head, ...change });
    await expect(createStudentFeePlan({ ...create, convertClassFee: true })).rejects.toThrow(message as string);
    expect(tx.feeHead.update).not.toHaveBeenCalled();
    expect(tx.studentFeePlan.create).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing plan for the same year and head", async () => {
    tx.feeHead.findFirst.mockResolvedValue(head);
    tx.studentFeePlan.findUnique.mockResolvedValue({ id: 3 });
    await expect(createStudentFeePlan(create)).rejects.toThrow("already has a student plan");
    expect(tx.studentFeePlan.create).not.toHaveBeenCalled();
    expect(tx.studentFeePlan.update).not.toHaveBeenCalled();
  });

  it.each([0, 1.5, 2_147_483_648, NaN])("rejects invalid amounts: %s", async (amount) => {
    await expect(createStudentFeePlan({ ...create, amount })).rejects.toThrow("whole number");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing year before creating a fee head", async () => {
    tx.academicYear.findUnique.mockResolvedValue(null);
    await expect(createStudentFeePlan(create)).rejects.toThrow("existing academic year");
    expect(tx.feeHead.create).not.toHaveBeenCalled();
  });
});

describe("student fee selection", () => {
  it("validates the year and active pupil roster before changing selections", async () => {
    tx.enrollment.findMany.mockResolvedValue([{ id: 20 }]);
    await expect(saveStudentFeePlan(save)).rejects.toThrow("only active students enrolled in this academic year");
    expect(tx.enrollment.findMany).toHaveBeenCalledWith({ where: { id: { in: [20, 21] }, academicYearId: 5, student: { status: "ACTIVE" } }, select: { id: true } });
    expect(tx.studentFeeAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("locks the plan and preserves old assignments while activating the new selection", async () => {
    await saveStudentFeePlan(save);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.studentFeePlan.findFirst.mock.invocationCallOrder[0]);
    expect(tx.studentFeeAssignment.updateMany).toHaveBeenNthCalledWith(1, { where: { planId: 3, enrollmentId: { notIn: [20, 21] } }, data: { isActive: false } });
    expect(tx.studentFeeAssignment.createMany).toHaveBeenCalledWith({ data: [{ planId: 3, enrollmentId: 20 }, { planId: 3, enrollmentId: 21 }], skipDuplicates: true });
    expect(tx.studentFeeAssignment.updateMany).toHaveBeenNthCalledWith(2, { where: { planId: 3, enrollmentId: { in: [20, 21] } }, data: { isActive: true } });
    expect(tx.studentFeePlan.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { amount: 600, isActive: true } });
  });

  it("allows clearing all selections, retaining historical assignment rows", async () => {
    tx.enrollment.findMany.mockResolvedValue([]);
    await saveStudentFeePlan({ ...save, enrollmentIds: [] });
    expect(tx.studentFeeAssignment.updateMany).toHaveBeenCalledWith({ where: { planId: 3, enrollmentId: { notIn: [] } }, data: { isActive: false } });
    expect(tx.studentFeeAssignment.createMany).not.toHaveBeenCalled();
  });

  it("rejects a plan from another year before changing assignments", async () => {
    tx.studentFeePlan.findFirst.mockResolvedValue(null);
    await expect(saveStudentFeePlan(save)).rejects.toThrow("selected academic year");
    expect(tx.studentFeeAssignment.updateMany).not.toHaveBeenCalled();
  });
});

describe("student fee billing", () => {
  it("bills selected active pupils once, with the plan's amount and fee name snapshot", async () => {
    expect(await issueStudentFeePlan(5, 3, 4, now)).toBe(2);
    expect(tx.studentFeeAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ planId: 3, isActive: true, enrollment: expect.objectContaining({ academicYearId: 5, student: { status: "ACTIVE" } }) }) }));
    expect(tx.invoice.createManyAndReturn.mock.calls[0][0].data.map((i: { studentFeeAssignmentId: number }) => i.studentFeeAssignmentId)).toEqual([40, 41]);
    expect(tx.invoiceLine.createMany).toHaveBeenCalledWith({ data: [{ invoiceId: 60, feeHeadId: 8, description: "Library", amount: 500 }, { invoiceId: 61, feeHeadId: 8, description: "Library", amount: 500 }] });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("excludes any existing same-head month bill, including legacy and cancelled invoices", async () => {
    tx.studentFeeAssignment.findMany.mockResolvedValue([]);
    expect(await issueStudentFeePlan(5, 3, 4, now)).toBe(0);
    expect(tx.studentFeeAssignment.findMany.mock.calls[0][0].where.enrollment.invoices).toEqual({ none: { academicYearId: 5, periodMonth: 4, lines: { some: { feeHeadId: 8 } } } });
    expect(tx.invoice.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("treats a unique assignment-month collision as an already issued retry", async () => {
    tx.invoice.createManyAndReturn.mockResolvedValue([]);
    expect(await issueStudentFeePlan(5, 3, 4, now)).toBe(0);
    expect(tx.invoice.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(tx.invoiceLine.createMany).not.toHaveBeenCalled();
  });

  it("rejects future months, wrong frequencies and unavailable plans", async () => {
    await expect(issueStudentFeePlan(5, 3, 7, now)).rejects.toThrow("has not started yet");
    await expect(issueStudentFeePlan(5, 3, 0, now)).rejects.toThrow("matching this fee's frequency");
    tx.studentFeePlan.findFirst.mockResolvedValue({ ...plan, feeHead: { ...head, frequency: "ONE_TIME" } });
    await expect(issueStudentFeePlan(5, 3, 1, now)).rejects.toThrow("matching this fee's frequency");
    tx.studentFeePlan.findFirst.mockResolvedValue({ ...plan, isActive: false });
    await expect(issueStudentFeePlan(5, 3, 1, now)).rejects.toThrow("unavailable");
    expect(tx.invoice.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("bills a one-time plan without imposing monthly enrollment cutoff", async () => {
    tx.studentFeePlan.findFirst.mockResolvedValue({ ...plan, feeHead: { ...head, frequency: "ONE_TIME" } });
    await issueStudentFeePlan(5, 3, 0, now);
    expect(tx.studentFeeAssignment.findMany.mock.calls[0][0].where.enrollment.enrolledOn).toBeUndefined();
    expect(tx.invoice.createManyAndReturn.mock.calls[0][0].data[0].periodMonth).toBe(0);
  });
});

describe("student fee workspace", () => {
  it("shows selected pupils and legacy billed periods without transport heads", async () => {
    db.academicYear.findUnique.mockResolvedValue({ nameBS: "2083" });
    db.studentFeePlan.findMany.mockResolvedValue([{ ...plan, assignments: [{ id: 40, enrollmentId: 20, isActive: true }, { id: 41, enrollmentId: 21, isActive: false }] }]);
    db.feeHead.findMany.mockResolvedValue([head]);
    db.invoice.findMany.mockResolvedValue([{ enrollmentId: 20, periodMonth: 2, lines: [{ feeHeadId: 8 }] }, { enrollmentId: 20, periodMonth: 1, lines: [{ feeHeadId: 8 }] }]);
    const result = await studentFeeWorkspace(5, now);
    expect(result.plans[0].selectedIds).toEqual([20]);
    expect(result.plans[0].assignments[0].billedMonths).toEqual([1, 2]);
    expect(result.months).toHaveLength(12);
    expect(result.months.filter((m) => m.started)).toHaveLength(6);
    expect(db.feeHead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, billingScope: { in: ["CLASS", "STUDENT"] } } }));
  });
});
