import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { reconcileLedger } from "./reconciliation";

describe("year-end reconciliation", () => {
  const invoice = (status = "PARTIAL", amount = 40, paymentStatus = "COMPLETED") => ({ id: 1, status, lines: [{ amount: 100, allocations: [{ amount, payment: { status: paymentStatus } }] }] });
  const payment = (allocated = 40, year = 3) => ({ id: 2, amount: 40, status: "COMPLETED", academicYearId: 3, allocations: [{ amount: allocated, invoiceLine: { invoice: { academicYearId: year, status: "PARTIAL" } } }] });
  it("reconciles partial payment without moving the outstanding amount", () => {
    expect(reconcileLedger([invoice()], [payment()])).toMatchObject({ billed: 100, settled: 40, outstanding: 60, issues: [] });
  });
  it("excludes reversed payments from settlement", () => {
    expect(reconcileLedger([invoice("ISSUED", 40, "REVERSED")], [])).toMatchObject({ settled: 0, outstanding: 100, issues: [] });
  });
  it("does not collect cancelled bills but flags completed payments left on them", () => {
    const result = reconcileLedger([invoice("CANCELLED")], []);
    expect(result.outstanding).toBe(0);
    expect(result.issues[0].problem).toContain("Cancelled invoice");
  });
  it("detects stale statuses, overallocated lines and mismatched receipt allocations", () => {
    const result = reconcileLedger([invoice("ISSUED", 110)], [payment(20)]);
    expect(result.issues).toHaveLength(3);
  });
  it("flags cross-year allocations rather than silently carrying balances", () => {
    expect(reconcileLedger([], [payment(40, 4)]).issues[0].problem).toContain("across academic years");
  });
  it("handles an empty year", () => {
    expect(reconcileLedger([], [])).toMatchObject({ billed: 0, settled: 0, outstanding: 0, issues: [] });
  });
});
