import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
const db = vi.hoisted(() => ({ guard: vi.fn(), audit: vi.fn(), years: vi.fn(), count: vi.fn(), reconciliation: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requirePage: db.guard }));
vi.mock("@/lib/audit", () => ({ listAuditEvents: db.audit }));
vi.mock("@/lib/fees/reconciliation", () => ({ getYearReconciliation: db.reconciliation }));
vi.mock("@/lib/prisma", () => ({ prisma: { academicYear: { findMany: db.years }, feeStructure: { count: db.count }, studentFeePlan: { count: db.count }, transportRegistration: { count: db.count } } }));
vi.mock("@/components/ui/page-frame", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => children;
  // Server components receive named client references, not runtime properties
  // attached to PageFrame. Do not mock .Body: that hid the production crash.
  return { PageFrame: Wrapper, PageFrameBody: Wrapper };
});
import ActivityPage from "./activity/page";
import ReadinessPage from "./readiness/page";

beforeEach(() => {
  vi.resetAllMocks();
  db.years.mockResolvedValue([{ id: 1, nameBS: "2083", isCurrent: true }, { id: 2, nameBS: "2084", isCurrent: false }]);
  db.count.mockResolvedValue(2);
  db.reconciliation.mockResolvedValue({ billed: 1000, settled: 400, outstanding: 600, invoices: 4, payments: 2, issues: [] });
  db.audit.mockResolvedValue([]);
});

describe("operational settings pages", () => {
  it("guards audit history before any record reads", async () => {
    db.guard.mockRejectedValueOnce(new Error("denied"));
    await expect(ActivityPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("denied");
    expect(db.audit).not.toHaveBeenCalled();
  });
  it("renders readable empty history and validates the cursor", async () => {
    const html = renderToStaticMarkup(await ActivityPage({ searchParams: Promise.resolve({ before: "-5" }) }));
    expect(db.guard).toHaveBeenCalledWith("/dashboard/settings/activity");
    expect(db.audit).toHaveBeenCalledWith(undefined);
    expect(html).toContain("No recorded activity");
  });
  it("selects a review year independently from the school-wide active year", async () => {
    const html = renderToStaticMarkup(await ReadinessPage({ searchParams: Promise.resolve({ year: "2" }) }));
    expect(db.guard).toHaveBeenCalledWith("/dashboard/settings/readiness");
    expect(db.reconciliation).toHaveBeenCalledWith(2);
    expect(html).toContain("Rs. 600");
    expect(html).toContain("not automatically transferred or forgiven");
  });
  it("does not read financial records for a denied account", async () => {
    db.guard.mockRejectedValueOnce(new Error("denied"));
    await expect(ReadinessPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("denied");
    expect(db.years).not.toHaveBeenCalled();
    expect(db.reconciliation).not.toHaveBeenCalled();
  });
});
