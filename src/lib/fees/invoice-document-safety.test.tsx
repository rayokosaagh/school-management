import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const db = vi.hoisted(() => ({ invoice: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/guard", () => ({ requirePage: vi.fn() }));
vi.mock("@/lib/registry/school", () => ({ getLetterhead: async () => ({ name: "Test School", configured: true }) }));
vi.mock("@/app/dashboard/fees/print/_components/print-button", () => ({ PrintButton: () => null }));
import { invoiceDocument } from "./documents";
import FeePrintPage from "@/app/dashboard/fees/print/page";

const bill = (status: string) => ({
  number: "INV-4-00012", status,
  issuedOn: new Date("2026-09-06T00:00:00Z"), dueOn: null, periodMonth: 0,
  academicYear: { nameBS: "2083" },
  enrollment: {
    rollNo: 1, student: { fullName: "Test Student", admissionNo: "TEST-1", guardians: [] },
    section: { name: "A", grade: { name: "Class 1" } },
  },
  lines: [{ amount: 500, description: "Original admission price", feeHead: { name: "Admission" }, allocations: [
    { amount: 100, payment: { status: "COMPLETED" } },
    { amount: 200, payment: { status: "REVERSED" } },
  ] }],
});

beforeEach(() => vi.resetAllMocks());

describe("invoice document financial safety", () => {
  it("keeps the original charge and completed payment history but cancelled invoices owe zero", async () => {
    db.invoice.findUnique.mockResolvedValue(bill("CANCELLED"));
    await expect(invoiceDocument("INV-4-00012")).resolves.toMatchObject({ status: "CANCELLED", total: 500, paid: 100, due: 0 });
  });

  it("excludes reversed money from the balance on an active invoice", async () => {
    db.invoice.findUnique.mockResolvedValue(bill("PARTIAL"));
    await expect(invoiceDocument("INV-4-00012")).resolves.toMatchObject({ status: "PARTIAL", total: 500, paid: 100, due: 400 });
  });

  it.each(["CANCELLED", "PARTIAL"])("prints cancellation status accurately for %s invoices", async (status) => {
    db.invoice.findUnique.mockResolvedValue(bill(status));
    const html = renderToStaticMarkup(await FeePrintPage({ searchParams: Promise.resolve({ invoice: "INV-4-00012" }) }));
    if (status === "CANCELLED") {
      expect(html).toContain("CANCELLED — This invoice is retained for history only. No payment is due against it.");
      expect(html).not.toContain("Still owed");
    } else {
      expect(html).not.toContain("CANCELLED —");
      expect(html).toContain("Still owed");
    }
    expect(html).toContain("Original admission price");
  });
});
