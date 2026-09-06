/// What a parent is handed: the bill, and the proof they paid it.
///
/// Kept apart from `fees.ts` because these read one document at a time by its
/// printed number, not the year's ledger — and because a printed document must
/// be assembled from what was recorded, never recomputed from today's data.
import { BS_MONTHS } from "@/lib/date/bs";
import { FeeError } from "./fees";
import { prisma } from "@/lib/prisma";

/// Money paid against one invoice line, counting only completed payments. A
/// reversed payment keeps its allocation for the audit trail but settles
/// nothing.
function settledOn(line: { allocations: { amount: number; payment: { status: string } }[] }) {
  return line.allocations.reduce(
    (sum, a) => sum + (a.payment.status === "COMPLETED" ? a.amount : 0),
    0,
  );
}

/// One invoice, ready to print.
export async function invoiceDocument(number: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { number },
    include: {
      academicYear: { select: { nameBS: true } },
      enrollment: {
        include: {
          student: { include: { guardians: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] } } },
          section: { include: { grade: true } },
        },
      },
      lines: {
        include: {
          feeHead: { select: { name: true } },
          allocations: { include: { payment: { select: { status: true } } } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!invoice) throw new FeeError("No invoice with that number.");

  const lines = invoice.lines.map((line) => ({
    // Copied onto the invoice when it was raised, so renaming a fee type later
    // cannot rewrite what a parent was told they were paying for.
    feeType: line.feeHead.name,
    description: line.description,
    amount: line.amount,
    paid: settledOn(line),
  }));
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const paid = lines.reduce((sum, line) => sum + line.paid, 0);
  const guardian = invoice.enrollment.student.guardians[0] ?? null;

  return {
    number: invoice.number,
    status: invoice.status,
    issuedOn: invoice.issuedOn,
    dueOn: invoice.dueOn,
    periodMonth: invoice.periodMonth,
    yearBS: invoice.academicYear.nameBS,
    student: {
      name: invoice.enrollment.student.fullName,
      admissionNo: invoice.enrollment.student.admissionNo,
      rollNo: invoice.enrollment.rollNo,
      section: `${invoice.enrollment.section.grade.name} ${invoice.enrollment.section.name}`,
    },
    guardian: guardian ? { name: guardian.fullName, phone: guardian.phone } : null,
    lines,
    total,
    paid,
    due: invoice.status === "CANCELLED" ? 0 : total - paid,
  };
}

/// One payment, ready to print as a receipt.
export async function receiptDocument(receiptNo: string) {
  const payment = await prisma.payment.findUnique({
    where: { receiptNo },
    include: {
      academicYear: { select: { nameBS: true } },
      receivedBy: { select: { username: true } },
      allocations: {
        orderBy: { id: "asc" },
        include: {
          invoiceLine: {
            include: {
              feeHead: { select: { name: true } },
              invoice: {
                include: {
                  enrollment: {
                    include: { student: true, section: { include: { grade: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!payment) throw new FeeError("No receipt with that number.");

  const first = payment.allocations[0]?.invoiceLine.invoice ?? null;
  if (!first) throw new FeeError("That payment settled nothing that can be printed.");

  return {
    receiptNo: payment.receiptNo,
    amount: payment.amount,
    paidOn: payment.paidOn,
    method: payment.method,
    reference: payment.reference,
    status: payment.status,
    yearBS: payment.academicYear.nameBS,
    receivedBy: payment.receivedBy?.username ?? null,
    // Snapshotted when the money was taken, so reprinting this years later
    // still names who actually handed it over.
    paidBy: { name: payment.paidByName, phone: payment.paidByPhone },
    student: {
      name: first.enrollment.student.fullName,
      admissionNo: first.enrollment.student.admissionNo,
      section: `${first.enrollment.section.grade.name} ${first.enrollment.section.name}`,
    },
    invoiceNumber: first.number,
    settled: payment.allocations.map((allocation) => ({
      feeType: allocation.invoiceLine.feeHead.name,
      description: allocation.invoiceLine.description,
      amount: allocation.amount,
      // Per line, not per receipt: one payment can clear Baisakh and Jestha
      // together, and "Monthly Fee" twice over would name neither.
      periodMonth: allocation.invoiceLine.invoice.periodMonth,
      invoiceNumber: allocation.invoiceLine.invoice.number,
    })),
  };
}

/// Several receipts for one pupil, as a single statement sheet.
///
/// One pupil only. A statement carries one name and one signature line, so two
/// children on one sheet would be a document nobody could use — better to
/// refuse than to print something misleading.
export async function statementDocument(receiptNos: string[]) {
  const wanted = [...new Set(receiptNos.filter((no) => no.trim() !== ""))];
  if (wanted.length === 0) throw new FeeError("Choose at least one receipt.");

  const payments = await prisma.payment.findMany({
    where: { receiptNo: { in: wanted } },
    // Oldest first: a statement is read as a history, not a newest-first feed.
    orderBy: { paidOn: "asc" },
    include: {
      academicYear: { select: { nameBS: true } },
      receivedBy: { select: { username: true } },
      allocations: {
        orderBy: { id: "asc" },
        include: {
          invoiceLine: {
            include: {
              feeHead: { select: { name: true } },
              invoice: {
                include: {
                  enrollment: {
                    include: { student: true, section: { include: { grade: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (payments.length !== wanted.length) throw new FeeError("One of those receipts does not exist.");

  const enrollmentIds = new Set(
    payments.flatMap((p) => p.allocations.map((a) => a.invoiceLine.invoice.enrollmentId)),
  );
  if (enrollmentIds.size === 0) throw new FeeError("Those payments settled nothing that can be printed.");
  if (enrollmentIds.size > 1) throw new FeeError("A statement can only cover one student.");

  const enrollment = payments[0].allocations[0].invoiceLine.invoice.enrollment;

  return {
    student: {
      name: enrollment.student.fullName,
      admissionNo: enrollment.student.admissionNo,
      section: `${enrollment.section.grade.name} ${enrollment.section.name}`,
    },
    yearBS: payments[0].academicYear.nameBS,
    rows: payments.map((payment) => ({
      receiptNo: payment.receiptNo,
      paidOn: payment.paidOn,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      paidByName: payment.paidByName,
      /// What this payment went towards, months named, joined for one cell.
      paidTowards: payment.allocations
        .map((a) => {
          const month = a.invoiceLine.invoice.periodMonth;
          const name = a.invoiceLine.description || a.invoiceLine.feeHead.name;
          return month > 0 ? `${name} · ${BS_MONTHS[month - 1]}` : name;
        })
        .join(", "),
    })),
    // Only completed money counts towards the total; a reversed payment stays
    // on the sheet, marked, so the history is not silently rewritten.
    total: payments.reduce((sum, p) => sum + (p.status === "COMPLETED" ? p.amount : 0), 0),
    reversed: payments.filter((p) => p.status !== "COMPLETED").length,
  };
}
