import { prisma } from "@/lib/prisma";

type Invoice = { id: number; status: string; lines: { amount: number; allocations: { amount: number; payment: { status: string } }[] }[] };
type Payment = { id: number; amount: number; status: string; academicYearId: number; allocations: { amount: number; invoiceLine: { invoice: { academicYearId: number; status: string } } }[] };

/** Independent read-only check. Never repairs balances or transfers old debt. */
export function reconcileLedger(invoices: Invoice[], payments: Payment[]) {
  const issues: { entity: "Invoice" | "Payment"; id: number; problem: string }[] = [];
  let billed = 0, settled = 0, outstanding = 0;
  for (const invoice of invoices) {
    let total = 0, paid = 0;
    for (const line of invoice.lines) {
      const allocated = line.allocations.reduce((sum, a) => sum + (a.payment.status === "COMPLETED" ? a.amount : 0), 0);
      total += line.amount;
      paid += allocated;
      if (line.amount <= 0 || allocated < 0 || allocated > line.amount || line.allocations.some((a) => a.amount <= 0)) {
        issues.push({ entity: "Invoice", id: invoice.id, problem: "Invalid line amount or payment allocation." });
      }
    }
    if (invoice.status === "CANCELLED") {
      if (paid > 0) issues.push({ entity: "Invoice", id: invoice.id, problem: "Cancelled invoice still has completed payments." });
      continue;
    }
    if (total === 0) issues.push({ entity: "Invoice", id: invoice.id, problem: "Invoice has no charge." });
    const expected = paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "ISSUED";
    if (invoice.status !== expected) issues.push({ entity: "Invoice", id: invoice.id, problem: `Stored status ${invoice.status} differs from calculated ${expected}.` });
    billed += total;
    settled += paid;
    outstanding += Math.max(0, total - paid);
  }
  for (const payment of payments) {
    const allocated = payment.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (payment.amount <= 0 || allocated !== payment.amount || payment.allocations.some((a) => a.amount <= 0)) {
      issues.push({ entity: "Payment", id: payment.id, problem: "Receipt amount does not match valid allocations." });
    }
    if (payment.allocations.some((a) => a.invoiceLine.invoice.academicYearId !== payment.academicYearId)) {
      issues.push({ entity: "Payment", id: payment.id, problem: "Payment is allocated across academic years." });
    }
  }
  return { billed, settled, outstanding, invoices: invoices.length, payments: payments.length, issues };
}

export async function getYearReconciliation(academicYearId: number) {
  const [invoices, payments] = await prisma.$transaction([
    prisma.invoice.findMany({ where: { academicYearId }, select: {
      id: true, status: true, lines: { select: { amount: true, allocations: { select: { amount: true, payment: { select: { status: true } } } } } },
    } }),
    prisma.payment.findMany({ where: { academicYearId }, select: {
      id: true, amount: true, status: true, academicYearId: true,
      allocations: { select: { amount: true, invoiceLine: { select: { invoice: { select: { academicYearId: true, status: true } } } } } },
    } }),
  ], { isolationLevel: "RepeatableRead" });
  return reconcileLedger(invoices, payments);
}
