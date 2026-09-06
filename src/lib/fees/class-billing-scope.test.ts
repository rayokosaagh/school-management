import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  academicYear: { findUniqueOrThrow: vi.fn() },
  feeHead: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  grade: { findMany: vi.fn() },
  feeStructure: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  feeStructureLine: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  enrollment: { findMany: vi.fn() },
  invoice: { createManyAndReturn: vi.fn(), groupBy: vi.fn() },
  invoiceLine: { createMany: vi.fn() },
  paymentAllocation: { groupBy: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { createFeeHead, createFeeStructure, feeWorkspace, issueMonth, issueStructure, setFeeAmounts, unbilledMonthCount } from "./fees";

const year = { id: 5, nameBS: "2083" };
const grade = { id: 2, name: "Class 1", order: 1 };
const date = new Date("2026-09-06T00:00:00Z");
const options = { issuedOn: date, dueOn: null, now: date };
const admission = { id: 1, feeHeadId: 1, amount: 2500, feeHead: { id: 1, name: "Admission", frequency: "ONE_TIME", billingScope: "CLASS" } };
const tuition = { id: 2, feeHeadId: 2, amount: 1200, feeHead: { id: 2, name: "Tuition", frequency: "MONTHLY", billingScope: "CLASS" } };
const transport = { id: 3, feeHeadId: 3, amount: 800, feeHead: { id: 3, name: "Transportation", frequency: "MONTHLY", billingScope: "TRANSPORT" } };
const mixed = { id: 10, name: "Class fees", gradeId: 2, academicYearId: 5, isActive: true, academicYear: year, grade, lines: [admission, tuition, transport] };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) => callback(db));
  db.feeStructure.findUnique.mockResolvedValue(mixed);
  db.feeStructure.findMany.mockResolvedValue([]);
  db.enrollment.findMany.mockResolvedValue([{ id: 20 }]);
  db.invoice.createManyAndReturn.mockResolvedValue([{ id: 100 }]);
  db.invoiceLine.createMany.mockResolvedValue({ count: 1 });
  db.academicYear.findUniqueOrThrow.mockResolvedValue(year);
  db.invoice.groupBy.mockResolvedValue([]);
  db.feeHead.findMany.mockResolvedValue([]);
  db.paymentAllocation.groupBy.mockResolvedValue([]);
  db.grade.findMany.mockResolvedValue([grade]);
});

describe("class billing and transport separation", () => {
  it("excludes previously issued class bills even when cancelled", async () => {
    await issueStructure(10, { ...options, month: 1 });
    expect(db.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      invoices: { none: { feeStructureId: 10, periodMonth: 1 } },
    }) }));
  });

  it("does not create invoice rows or lines when every eligible student is already billed", async () => {
    db.enrollment.findMany.mockResolvedValue([]);
    await expect(issueStructure(10, { ...options, month: 1 })).resolves.toBe(0);
    expect(db.invoice.createManyAndReturn).not.toHaveBeenCalled();
    expect(db.invoiceLine.createMany).not.toHaveBeenCalled();
  });

  it.each([
    { month: 0, expected: admission },
    { month: 1, expected: tuition },
  ])("issues only CLASS lines for billing period $month in a mixed plan", async ({ month, expected }) => {
    await expect(issueStructure(10, { ...options, month })).resolves.toBe(1);
    expect(db.invoiceLine.createMany).toHaveBeenCalledWith({ data: [{
      invoiceId: 100, feeHeadId: expected.feeHeadId, description: expected.feeHead.name, amount: expected.amount,
    }] });
    expect(db.invoice.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ enrollmentId: 20, feeStructureId: 10, academicYearId: 5, periodMonth: month })],
    }));
  });

  it("does not issue a class bill from a transport-only plan", async () => {
    db.feeStructure.findUnique.mockResolvedValue({ ...mixed, lines: [transport] });
    await expect(issueStructure(10, { ...options, month: 1 })).resolves.toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.invoice.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("rejects transport heads in a forged class structure request", async () => {
    await expect(createFeeStructure({ academicYearId: 5, gradeId: 2, name: "Class fees", lines: [{ feeHeadId: 3, amount: 800 }] })).rejects.toThrow("active fee head");
    expect(db.feeHead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [3] }, isActive: true, billingScope: "CLASS" } }));
    expect(db.feeStructure.create).not.toHaveBeenCalled();
  });

  it.each([800, null])("rejects transport matrix changes before any writes (amount %s)", async (amount) => {
    db.feeHead.count.mockResolvedValue(0);
    await expect(setFeeAmounts(5, [{ gradeId: 2, feeHeadId: 3, amount }])).rejects.toThrow("student transport register");
    expect(db.feeHead.count).toHaveBeenCalledWith({ where: { id: { in: [3] }, billingScope: "CLASS" } });
    expect(db.feeStructure.findMany).not.toHaveBeenCalled();
    expect(db.feeStructureLine.update).not.toHaveBeenCalled();
    expect(db.feeStructureLine.delete).not.toHaveBeenCalled();
  });

  it("rejects new transport class fee types", async () => {
    await expect(createFeeHead("Transportation", "MONTHLY")).rejects.toThrow("student transport register");
    expect(db.feeHead.create).not.toHaveBeenCalled();
  });

  it("reads only class monthly plans for dashboard billing reminders", async () => {
    await expect(unbilledMonthCount(5, date)).resolves.toBe(0);
    expect(db.feeStructure.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { academicYearId: 5, isActive: true, lines: { some: { feeHead: { frequency: "MONTHLY", billingScope: "CLASS" } } } },
    }));
  });

  it("keeps historical transport debt visible while separating yearly issuance counts", async () => {
    db.feeStructure.findMany.mockResolvedValue([{ ...mixed, lines: [admission, tuition] }]);
    const invoice = (id: number, periodMonth: number, lines: typeof mixed.lines) => ({
      id, feeStructureId: 10, periodMonth, lines, number: `INV-${id}`, issuedOn: date, dueOn: null,
    });
    db.enrollment.findMany.mockResolvedValue([{
      id: 20, student: { fullName: "Pupil", admissionNo: "S1", status: "ACTIVE", guardians: [] },
      section: { id: 4, name: "A", gradeId: 2, grade }, feeNote: null,
      invoices: [invoice(1, 0, [admission]), invoice(2, 1, [tuition, transport])],
    }]);
    const result = await feeWorkspace(5, date);
    expect(result.structures[0]).toMatchObject({ onceIssued: 1, issued: 2 });
    expect(result.structures[0].months[0].issued).toBe(1);
    expect(result.totals.billed).toBe(4500);
    expect(result.invoices[1].feeTypes).toEqual(["Transportation", "Tuition"]);
    expect(db.feeHead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { billingScope: { in: ["CLASS", "STUDENT"] } } }));
    expect(db.feeStructure.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ lines: expect.objectContaining({ where: { feeHead: { billingScope: "CLASS" } } }) }),
    }));
  });

  it("includes one-time lines of a mixed plan in the school-wide yearly billing run", async () => {
    db.feeStructure.findMany.mockResolvedValue([mixed]);
    await expect(issueMonth(5, { ...options, month: 0 })).resolves.toEqual({ invoices: 1, classes: 1 });
    expect(db.invoiceLine.createMany).toHaveBeenCalledWith({ data: [{ invoiceId: 100, feeHeadId: 1, description: "Admission", amount: 2500 }] });
  });

  it("offers per-student fee types in management but not in class pricing", async () => {
    const studentHead = { id: 9, name: "Library", frequency: "ONE_TIME", billingScope: "STUDENT", isActive: true };
    db.feeHead.findMany.mockResolvedValue([admission.feeHead, studentHead]);
    db.enrollment.findMany.mockResolvedValue([]);
    const workspace = await feeWorkspace(5, date);
    expect(workspace.heads.map(head => head.id)).toEqual([admission.feeHead.id]);
    expect(workspace.managedHeads.map(head => head.id)).toContain(studentHead.id);
    await createFeeHead("Art club", "MONTHLY", "STUDENT");
    expect(db.feeHead.create).toHaveBeenCalledWith({ data: { name: "Art club", frequency: "MONTHLY", billingScope: "STUDENT" } });
  });
});
