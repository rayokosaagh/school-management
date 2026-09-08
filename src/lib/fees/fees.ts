import { createHash, randomUUID } from "crypto";
import { Prisma, type FeeFrequency } from "@/generated/prisma/client";
import { BS_MONTHS, adToBs, bsToAd } from "@/lib/date/bs";
import { money } from "@/lib/fees/money";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

export class FeeError extends Error {}

function requireWholeRupees(amount: number, what: string) {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new FeeError(`${what} must be a whole number of rupees above zero.`);
  }
}

/// 1-12. Written out rather than derived so the strip and the nudge iterate
/// the same list.
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/// What one invoice line has actually been paid, from its own allocation
/// rows.
///
/// Used where a single invoice is already loaded with its allocations —
/// `recordPayment`, which must read the balance inside the lock it just took.
/// `feeWorkspace` cannot use this: nesting allocations under every line of
/// every invoice is what it is trying to avoid, so it sums them in one
/// aggregate instead.
///
/// A reversed payment has been struck off the ledger: its allocations stay for
/// the audit trail, but they no longer pay for anything.
type Allocated = { allocations: { amount: number; payment: { status: string } }[] };
const settledOnLine = (line: Allocated) =>
  line.allocations.reduce((sum, a) => sum + (a.payment.status === "COMPLETED" ? a.amount : 0), 0);

export type InvoiceRow = {
  id: number;
  number: string;
  enrollmentId: number;
  student: string;
  studentNp: string | null;
  admissionNo: string;
  section: string;
  issuedOn: Date;
  dueOn: Date | null;
  total: number;
  paid: number;
  due: number;
  overdue: boolean;
  /// What the bill is for, named once each and sorted. An invoice number
  /// identifies a bill; only the fee types say what was charged.
  feeTypes: string[];
  /// Which instalment: 1-12 for a monthly bill, 0 for a one-time charge.
  /// Twelve months of the same fee type are otherwise indistinguishable in a
  /// list — every one of them reads "Monthly Fee, Rs. 1,000 due".
  periodMonth: number;
};

/// Everything the Fees page shows, in one pass over the year's enrolments.
///
/// The invoice list is derived from that same pass rather than a second,
/// `take`-limited query: a bursar has to be able to receipt *any* unpaid
/// invoice, not just the most recently issued page of them.
export async function feeWorkspace(academicYearId: number, now = new Date()) {
  const [year, heads, grades, structures, enrollments, allocations] = await Promise.all([
    prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } }),
    prisma.feeHead.findMany({
      where: { billingScope: { in: ["CLASS", "STUDENT"] } },
      orderBy: { name: "asc" },
      include: { _count: { select: { structureLines: true, invoiceLines: true } } },
    }),
    prisma.grade.findMany({ orderBy: { order: "asc" } }),
    prisma.feeStructure.findMany({
      where: { academicYearId },
      orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
      include: { grade: true, lines: { where: { feeHead: { billingScope: "CLASS" } }, include: { feeHead: true }, orderBy: { id: "asc" } } },
    }),
    prisma.enrollment.findMany({
      where: { academicYearId },
      include: {
        student: {
          include: {
            // Only what the collection form needs to name a payer. Ordered so
            // the family's main contact is offered first.
            guardians: {
              select: { id: true, fullName: true, phone: true, relation: true },
              orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
            },
          },
        },
        section: { include: { grade: true } },
        feeNote: { select: { body: true } },
        invoices: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { id: "desc" },
          include: {
            lines: {
              include: {
                feeHead: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ section: { grade: { order: "asc" } } }, { rollNo: "asc" }],
    }),
    // What has actually been paid, per invoice line, as one aggregate rather
    // than an allocation list nested inside every line of every invoice.
    //
    // Monthly billing turns 62 invoices a year into ~3,000, and the nested
    // form made this read grow with every month of the year. The numbers are
    // identical; only the shape of the query changes.
    //
    // A reversed payment has been struck off the ledger: its allocations stay
    // for the audit trail, but they no longer pay for anything, so only
    // COMPLETED is summed.
    prisma.paymentAllocation.groupBy({
      by: ["invoiceLineId"],
      where: {
        payment: { status: "COMPLETED" },
        invoiceLine: { invoice: { academicYearId, status: { not: "CANCELLED" } } },
      },
      _sum: { amount: true },
    }),
  ]);

  const paidByLine = new Map(allocations.map((row) => [row.invoiceLineId, row._sum.amount ?? 0]));
  const settled = (line: { id: number }) => paidByLine.get(line.id) ?? 0;

  const yearBs = Number(year.nameBS);

  // Compared date-only: an invoice due today is not yet late.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const invoices: InvoiceRow[] = [];
  const balances = [];
  const guardiansByEnrollment = new Map<number, typeof enrollments[number]["student"]["guardians"]>();
  const issuedByStructure = new Map<number, number>();
  // Keyed "structureId:periodMonth", so a plan's strip can say how far each
  // month got without a second pass over the invoices.
  const issuedByMonth = new Map<string, number>();
  let billed = 0;
  let collected = 0;
  let unbilled = 0;

  for (const enrollment of enrollments) {
    const section = `${enrollment.section.grade.name} ${enrollment.section.name}`;
    guardiansByEnrollment.set(enrollment.id, enrollment.student.guardians);
    let studentBilled = 0;
    let studentPaid = 0;
    // Union across the pupil's bills: charged for Tuition on two invoices,
    // they are still charged for Tuition once as far as the list is concerned.
    const studentTypes = new Set<string>();
    // And what each of those types came to, summed across the same bills. The
    // list's fee-type strip narrows the money columns to one type, which the
    // row total alone cannot answer: "owes Rs. 16,500" is not "owes Rs. 6,000
    // of admission".
    const perType = new Map<string, { name: string; billed: number; paid: number }>();

    for (const invoice of enrollment.invoices) {
      const total = invoice.lines.reduce((sum, line) => sum + line.amount, 0);
      const paid = invoice.lines.reduce((sum, line) => sum + settled(line), 0);
      const feeTypes = [...new Set(invoice.lines.map((line) => line.feeHead.name))].sort();
      for (const name of feeTypes) studentTypes.add(name);
      for (const line of invoice.lines) {
        const cell = perType.get(line.feeHead.name) ?? { name: line.feeHead.name, billed: 0, paid: 0 };
        cell.billed += line.amount;
        cell.paid += settled(line);
        perType.set(cell.name, cell);
      }
      studentBilled += total;
      studentPaid += paid;
      if (invoice.feeStructureId !== null) {
        issuedByStructure.set(invoice.feeStructureId, (issuedByStructure.get(invoice.feeStructureId) ?? 0) + 1);
        const key = `${invoice.feeStructureId}:${invoice.periodMonth}`;
        issuedByMonth.set(key, (issuedByMonth.get(key) ?? 0) + 1);
      }
      invoices.push({
        id: invoice.id,
        number: invoice.number,
        enrollmentId: enrollment.id,
        student: enrollment.student.fullName,
        studentNp: enrollment.student.fullNameNp,
        admissionNo: enrollment.student.admissionNo,
        section,
        issuedOn: invoice.issuedOn,
        dueOn: invoice.dueOn,
        total,
        paid,
        due: total - paid,
        // Derived, not stored: nothing sweeps the table at midnight, so a
        // persisted OVERDUE flag would be stale for most of the day.
        overdue: total - paid > 0 && invoice.dueOn !== null && invoice.dueOn < today,
        feeTypes,
        periodMonth: invoice.periodMonth,
      });
    }

    // A pupil nobody has billed yet gets a row of their own rather than a
    // footnote: they are the ones still needing action, and counting them
    // while hiding them left most of the school off the page.
    //
    // Only an active pupil, though. `issueStructure` bills ACTIVE students
    // only, so a row offering to bill a departed one would offer an action
    // that silently does nothing.
    if (studentBilled === 0) {
      if (enrollment.student.status !== "ACTIVE") continue;
      unbilled++;
      balances.push({
        enrollmentId: enrollment.id,
        name: enrollment.student.fullName,
        nameNp: enrollment.student.fullNameNp,
        admissionNo: enrollment.student.admissionNo,
        section,
        gradeId: enrollment.section.gradeId,
        sectionId: enrollment.section.id,
        gradeName: enrollment.section.grade.name,
        sectionName: enrollment.section.name,
        hasBill: false,
        note: enrollment.feeNote?.body ?? null,
        feeTypes: [],
        byType: [] as { name: string; billed: number; paid: number; due: number }[],
        billed: 0,
        paid: 0,
        due: 0,
      });
      continue;
    }
    billed += studentBilled;
    collected += studentPaid;
    balances.push({
      enrollmentId: enrollment.id,
      name: enrollment.student.fullName,
      nameNp: enrollment.student.fullNameNp,
      admissionNo: enrollment.student.admissionNo,
      section,
      gradeId: enrollment.section.gradeId,
      sectionId: enrollment.section.id,
      gradeName: enrollment.section.grade.name,
      sectionName: enrollment.section.name,
      hasBill: true,
      note: enrollment.feeNote?.body ?? null,
      feeTypes: [...studentTypes].sort(),
      byType: [...perType.values()]
        .map((row) => ({ ...row, due: row.billed - row.paid }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      billed: studentBilled,
      paid: studentPaid,
      due: studentBilled - studentPaid,
    });
  }

  const openInvoices = invoices.filter((invoice) => invoice.due > 0);

  return {
    heads: heads.filter(head => head.billingScope === "CLASS"),
    managedHeads: heads,
    grades,
    structures: structures.filter((s) => s.lines.length > 0).map((s) => {
      const monthly = s.lines.some((line) => line.feeHead.frequency === "MONTHLY");
      return {
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        grade: s.grade,
        lines: s.lines,
        total: s.lines.reduce((sum, line) => sum + line.amount, 0),
        issued: issuedByStructure.get(s.id) ?? 0,
        onceIssued: issuedByMonth.get(`${s.id}:0`) ?? 0,
        monthly,
        // Twelve entries whether or not they have been billed, so the strip is
        // the same shape all year and a gap reads as a gap.
        months: monthly
          ? MONTHS.map((month) => ({
              month,
              issued: issuedByMonth.get(`${s.id}:${month}`) ?? 0,
              started: bsToAd({ year: yearBs, month, day: 1 }) <= now,
            }))
          : [],
      };
    }),
    invoices,
    openInvoices,
    /// Guardians for the pupils who still owe something, keyed by enrolment.
    ///
    /// Built only for those pupils rather than the whole roll: the collection
    /// form is the only thing that reads it, and it can only ever be opened on
    /// a bill that is still unpaid.
    guardians: Object.fromEntries(
      [...new Set(openInvoices.map((invoice) => invoice.enrollmentId))].map((id) => [
        id,
        guardiansByEnrollment.get(id) ?? [],
      ]),
    ),
    balances,
    totals: {
      billed,
      collected,
      outstanding: billed - collected,
      arrears: balances.filter((row) => row.due > 0).length,
      overdue: invoices.filter((invoice) => invoice.overdue).length,
      /// What the late bills are worth, not just how many there are: five
      /// overdue bills at Rs. 200 and five at Rs. 20,000 are not the same
      /// morning's work.
      overdueAmount: invoices.reduce((sum, invoice) => (invoice.overdue ? sum + invoice.due : sum), 0),
      unbilled,
      // Months that have arrived on a monthly plan and were never billed.
      // A month still in the future is not a missed one.
      unbilledMonths: structures.reduce((n, s) => {
        if (!s.lines.some((line) => line.feeHead.frequency === "MONTHLY")) return n;
        return (
          n +
          MONTHS.filter(
            (month) =>
              bsToAd({ year: yearBs, month, day: 1 }) <= now &&
              (issuedByMonth.get(`${s.id}:${month}`) ?? 0) === 0,
          ).length
        );
      }, 0),
    },
  };
}

/// Where one charge stands. `notBilled` is not a debt — nobody has asked for
/// the money yet — which is why it is its own state rather than an unpaid zero.
export type FeeStatus = "paid" | "part" | "unpaid" | "notBilled";

function statusOf(charged: number, paid: number): FeeStatus {
  if (charged === 0) return "notBilled";
  if (paid >= charged) return "paid";
  return paid > 0 ? "part" : "unpaid";
}

/// Everything the pupil pane shows, for one enrolment.
///
/// Its own read rather than a slice of `feeWorkspace`: the per-type breakdown
/// and the payment history are wanted for one pupil at a time, and carrying
/// them for all 246 on every page load is what the workspace query is shaped
/// to avoid.
export async function pupilFees(enrollmentId: number, now = new Date()) {
  const enrollment = await prisma.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      student: true,
      academicYear: { select: { nameBS: true } },
      section: { include: { grade: true } },
      feeNote: { select: { body: true, updatedAt: true } },
      invoices: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { id: "desc" },
        include: { lines: { include: { feeHead: true } } },
      },
    },
  });

  const lineIds = enrollment.invoices.flatMap((invoice) => invoice.lines.map((line) => line.id));

  const [paidPerLine, payments] = await Promise.all([
    prisma.paymentAllocation.groupBy({
      by: ["invoiceLineId"],
      where: { invoiceLineId: { in: lineIds }, payment: { status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { status: "COMPLETED", allocations: { some: { invoiceLineId: { in: lineIds } } } },
      orderBy: { id: "desc" },
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        paidOn: true,
        method: true,
        reference: true,
        paidByName: true,
        paidByPhone: true,
        receivedBy: { select: { username: true } },
      },
    }),
  ]);
  const paidOn = new Map(paidPerLine.map((row) => [row.invoiceLineId, row._sum.amount ?? 0]));

  // One row per fee type, summed across however many invoices carried it.
  const byType = new Map<number, { name: string; frequency: FeeFrequency; charged: number; paid: number }>();
  // And one cell per month, for a pupil on a monthly fee.
  const perMonth = new Map<number, { charged: number; paid: number }>();

  // Compared date-only, the same rule the workspace list uses: a bill due
  // today is not late yet, and one bill must never read overdue in the pane
  // and on time in the list.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // The pupil's own bills. This is the only list of them now that the Fees
  // page has no Invoices tab, so it carries what that tab carried: the number
  // to print by, when it was due, and what is still owed on it.
  const bills = [];

  for (const invoice of enrollment.invoices) {
    let billCharged = 0;
    let billPaid = 0;
    for (const line of invoice.lines) {
      const paid = paidOn.get(line.id) ?? 0;
      const row = byType.get(line.feeHeadId) ?? {
        name: line.feeHead.name,
        frequency: line.feeHead.frequency,
        charged: 0,
        paid: 0,
      };
      row.charged += line.amount;
      row.paid += paid;
      byType.set(line.feeHeadId, row);
      billCharged += line.amount;
      billPaid += paid;

      if (invoice.periodMonth > 0) {
        const cell = perMonth.get(invoice.periodMonth) ?? { charged: 0, paid: 0 };
        cell.charged += line.amount;
        cell.paid += paid;
        perMonth.set(invoice.periodMonth, cell);
      }
    }

    bills.push({
      id: invoice.id,
      number: invoice.number,
      /// 1-12 for one month's instalment, 0 for a one-off charge. Twelve
      /// monthly bills are otherwise indistinguishable in a list.
      periodMonth: invoice.periodMonth,
      issuedOn: invoice.issuedOn,
      dueOn: invoice.dueOn,
      charged: billCharged,
      paid: billPaid,
      owed: billCharged - billPaid,
      overdue: billCharged - billPaid > 0 && invoice.dueOn !== null && invoice.dueOn < today,
      status: statusOf(billCharged, billPaid),
      feeTypes: [...new Set(invoice.lines.map((line) => line.feeHead.name))].sort(),
    });
  }

  const charged = [...byType.values()].reduce((sum, row) => sum + row.charged, 0);
  const paid = [...byType.values()].reduce((sum, row) => sum + row.paid, 0);

  const yearBs = Number(enrollment.academicYear.nameBS);
  const joinedMonth = adToBs(enrollment.enrolledOn).month;
  const onMonthly = [...byType.values()].some((row) => row.frequency === "MONTHLY");

  return {
    student: {
      name: enrollment.student.fullName,
      nameNp: enrollment.student.fullNameNp,
      admissionNo: enrollment.student.admissionNo,
      section: `${enrollment.section.grade.name} ${enrollment.section.name}`,
    },
    summary: { charged, paid, owed: charged - paid, status: statusOf(charged, paid) },
    byFeeType: [...byType.values()]
      .map((row) => ({ ...row, owed: row.charged - row.paid, status: statusOf(row.charged, row.paid) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    /// Empty for a pupil on no monthly fee: there is no strip to draw.
    months: onMonthly
      ? MONTHS.map((month) => {
          const cell = perMonth.get(month);
          const started = bsToAd({ year: yearBs, month, day: 1 }) <= now;
          return {
            month,
            charged: cell?.charged ?? 0,
            paid: cell?.paid ?? 0,
            // Before they joined is not a gap in the school's billing.
            state: month < joinedMonth
              ? ("beforeJoining" as const)
              : cell
                ? statusOf(cell.charged, cell.paid)
                : started
                  ? ("notBilled" as const)
                  : ("future" as const),
          };
        })
      : [],
    /// Newest first, following the `id: "desc"` the invoices were read in.
    bills,
    payments,
    note: enrollment.feeNote?.body ?? null,
    noteUpdatedAt: enrollment.feeNote?.updatedAt ?? null,
  };
}

/// The office's running note for one pupil's fees this year.
///
/// Emptying it removes the row rather than storing a blank, so "has a note" is
/// the presence of the record and never an empty string masquerading as one.
export async function setFeeNote(enrollmentId: number, body: string, updatedById?: number) {
  const text = body.trim();
  if (text === "") {
    await prisma.feeNote.deleteMany({ where: { enrollmentId } });
    return null;
  }
  return prisma.feeNote.upsert({
    where: { enrollmentId },
    create: { enrollmentId, body: text, updatedById },
    update: { body: text, updatedById },
  });
}

export type FeeAmount = { gradeId: number; feeHeadId: number; amount: number | null };

/// Writes the fee matrix: an amount for a class and a fee type, or `null` to
/// stop charging it.
///
/// Folds into whatever plans a class already has rather than imposing its own
/// shape — live invoices point at those plans, so replacing them would mean
/// moving real debt. A class with no plan gets one; a class the caller did not
/// mention is left untouched.
export async function setFeeAmounts(academicYearId: number, entries: FeeAmount[], actor?: import("@/lib/audit").AuditActor) {
  for (const entry of entries) {
    if (entry.amount !== null) requireWholeRupees(entry.amount, "Every amount");
  }
  if (entries.length === 0) return;

  const gradeIds = [...new Set(entries.map((e) => e.gradeId))];

  return prisma.$transaction(async (tx) => {
    const headIds = [...new Set(entries.map((entry) => entry.feeHeadId))];
    const classHeads = await tx.feeHead.count({ where: { id: { in: headIds }, billingScope: "CLASS" } });
    if (classHeads !== headIds.length) throw new FeeError("Transport prices belong in the student transport register, not class fees.");
    const plans = await tx.feeStructure.findMany({
      where: { academicYearId, gradeId: { in: gradeIds } },
      include: { lines: { select: { id: true, feeHeadId: true } } },
      orderBy: { id: "asc" },
    });
    const grades = await tx.grade.findMany({
      where: { id: { in: gradeIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(grades.map((g) => [g.id, g.name]));

    // Where each (class, fee type) already lives, so an edit lands on the
    // existing line wherever the school happened to put it.
    const lineAt = new Map<string, number>();
    const planFor = new Map<number, number>();
    for (const plan of plans) {
      // The first active plan is where new lines go. A class split across
      // several keeps them; nothing is merged behind the school's back.
      if (!planFor.has(plan.gradeId) && plan.isActive) planFor.set(plan.gradeId, plan.id);
      for (const line of plan.lines) lineAt.set(`${plan.gradeId}:${line.feeHeadId}`, line.id);
    }

    for (const entry of entries) {
      const key = `${entry.gradeId}:${entry.feeHeadId}`;
      const existing = lineAt.get(key);

      if (entry.amount === null) {
        // Only the line goes. An invoice copies its own amount and wording, so
        // bills already sent are untouched.
        if (existing) await tx.feeStructureLine.delete({ where: { id: existing } });
        continue;
      }

      if (existing) {
        await tx.feeStructureLine.update({
          where: { id: existing },
          data: { amount: entry.amount },
        });
        continue;
      }

      let planId = planFor.get(entry.gradeId);
      if (planId === undefined) {
        const created = await tx.feeStructure.create({
          data: {
            academicYearId,
            gradeId: entry.gradeId,
            // Named after the class rather than asked for: a name typed per
            // class is how "Kindergarden Term Admission" and "Senior
            // Kindergarden" ended up as two conventions for one idea.
            name: `${nameOf.get(entry.gradeId) ?? "Class"} fees`,
          },
        });
        planId = created.id;
        planFor.set(entry.gradeId, planId);
      }

      const line = await tx.feeStructureLine.create({
        data: { feeStructureId: planId, feeHeadId: entry.feeHeadId, amount: entry.amount },
      });
      lineAt.set(key, line.id);
    }

    // A plan whose last line was cleared charges nothing and cannot be
    // billed, so it would sit in Send bills as a row that does nothing.
    // One that has already issued invoices stays: they point at it, and
    // removing it would orphan real debt.
    await tx.feeStructure.deleteMany({
      where: {
        academicYearId,
        gradeId: { in: gradeIds },
        lines: { none: {} },
        invoices: { none: {} },
      },
    });
    if (actor) await writeAuditEvent(tx, actor, {
      action: "class.prices_saved", entityType: "AcademicYear", entityId: academicYearId,
      academicYearId, details: { entries: entries.length, classes: gradeIds.length },
    });
  });
}

/// How many months have arrived on a monthly fee plan without being billed.
///
/// The same number `feeWorkspace` reports, from three small queries instead of
/// a pass over every enrolment in the year. Overview needs the count and
/// nothing else, and it renders on every dashboard load.
export async function unbilledMonthCount(academicYearId: number, now = new Date()) {
  const [year, plans, issued] = await Promise.all([
    prisma.academicYear.findUniqueOrThrow({
      where: { id: academicYearId },
      select: { nameBS: true },
    }),
    prisma.feeStructure.findMany({
      where: { academicYearId, isActive: true, lines: { some: { feeHead: { frequency: "MONTHLY", billingScope: "CLASS" } } } },
      select: { id: true },
    }),
    prisma.invoice.groupBy({
      by: ["feeStructureId", "periodMonth"],
      where: { academicYearId, periodMonth: { gt: 0 }, status: { not: "CANCELLED" } },
      _count: true,
    }),
  ]);
  if (plans.length === 0) return 0;

  const billed = new Set(issued.map((row) => `${row.feeStructureId}:${row.periodMonth}`));
  const yearBs = Number(year.nameBS);

  return plans.reduce(
    (n, plan) =>
      n +
      MONTHS.filter(
        (month) =>
          bsToAd({ year: yearBs, month, day: 1 }) <= now && !billed.has(`${plan.id}:${month}`),
      ).length,
    0,
  );
}

export async function createFeeHead(name: string, frequency: FeeFrequency = "ONE_TIME", billingScope: "CLASS" | "STUDENT" = "CLASS") {
  if (billingScope !== "CLASS" && billingScope !== "STUDENT") throw new FeeError("Choose class-wide or per-student billing.");
  if (name.trim().length < 2) throw new FeeError("Enter a fee-type name.");
  if (/\b(transport|transportation|bus)\b/i.test(name)) {
    throw new FeeError("Use the student transport register to set transport prices and pickup locations.");
  }
  return prisma.feeHead.create({ data: { name: name.trim(), frequency, billingScope } });
}

export async function setFeeHeadActive(id: number, isActive: boolean) {
  return prisma.feeHead.update({ where: { id }, data: { isActive } });
}

/// Removes a fee type outright, with everything that only priced it.
///
/// Only ever a fee nobody has been billed for. An invoice copies the wording
/// and the amount it charged, but it still points at the type, and a school
/// has to be able to explain a bill it sent three months ago — so a type that
/// has reached a parent is deactivated, never deleted. Until then it is just
/// a piece of setup somebody got wrong, and leaving no way to take it back
/// means a mistyped fee sits in the list for the rest of the year.
///
/// Prices go with it: a structure line and a student plan are ways of saying
/// what this type costs, and neither outlives it. Anything already invoiced
/// is untouched, because it was copied rather than joined.
export async function deleteFeeHead(id: number, actor?: import("@/lib/audit").AuditActor) {
  const head = await prisma.feeHead.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { invoiceLines: true } } },
  });
  if (!head) throw new FeeError("That fee type no longer exists.");
  if (head._count.invoiceLines > 0) {
    throw new FeeError(
      `${head.name} has already been billed, so it cannot be deleted. Stop using it instead — existing bills keep their charges.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const plans = await tx.studentFeePlan.findMany({ where: { feeHeadId: id }, select: { id: true } });
    const planIds = plans.map((plan) => plan.id);
    if (planIds.length > 0) {
      await tx.studentFeeAssignment.deleteMany({ where: { planId: { in: planIds } } });
      await tx.studentFeePlan.deleteMany({ where: { id: { in: planIds } } });
    }

    const lines = await tx.feeStructureLine.findMany({
      where: { feeHeadId: id },
      select: { feeStructureId: true },
    });
    await tx.feeStructureLine.deleteMany({ where: { feeHeadId: id } });

    // A plan whose last line was this type charges nothing and cannot be
    // billed. The same rule setFeeAmounts applies, for the same reason.
    const touched = [...new Set(lines.map((line) => line.feeStructureId))];
    if (touched.length > 0) {
      await tx.feeStructure.deleteMany({
        where: { id: { in: touched }, lines: { none: {} }, invoices: { none: {} } },
      });
    }

    await tx.feeHead.delete({ where: { id } });
    if (actor) await writeAuditEvent(tx, actor, {
      action: "fee_type.deleted", entityType: "FeeHead", entityId: id, details: {},
    });
    return head;
  });
}

/// An amount for one fee type in one class. How often it is charged comes
/// from the fee type itself, so two classes on the same fee can never disagree
/// about it.
export type StructureLineInput = { feeHeadId: number; amount: number };

/// A structure is a grade's whole bill for the year — tuition, admission and
/// exam fees together — so it takes as many lines as the school charges.
export async function createFeeStructure(input: {
  academicYearId: number;
  gradeId: number;
  name: string;
  lines: StructureLineInput[];
}) {
  if (input.name.trim().length < 2) throw new FeeError("Enter a structure name.");
  if (input.lines.length === 0) throw new FeeError("Add at least one fee line.");
  for (const line of input.lines) requireWholeRupees(line.amount, "Every amount");
  if (new Set(input.lines.map((l) => l.feeHeadId)).size !== input.lines.length) {
    throw new FeeError("Each fee head can appear only once in a structure.");
  }

  const heads = await prisma.feeHead.findMany({
    where: { id: { in: input.lines.map((l) => l.feeHeadId) }, isActive: true, billingScope: "CLASS" },
    select: { id: true },
  });
  if (heads.length !== input.lines.length) throw new FeeError("Choose an active fee head for every line.");

  return prisma.feeStructure.create({
    data: {
      academicYearId: input.academicYearId,
      gradeId: input.gradeId,
      name: input.name.trim(),
      lines: {
        create: input.lines.map((line) => ({
          feeHeadId: line.feeHeadId,
          amount: line.amount,
        })),
      },
    },
  });
}

/// Bills every active enrolment in the structure's grade that has not been
/// billed for it already.
///
/// The whole cohort is written in a handful of statements rather than three
/// per pupil: a grade of a few hundred used to walk the transaction past
/// Postgres' patience, and a half-issued run is the worst possible outcome for
/// a ledger.
export type IssueOptions = {
  actor?: import("@/lib/audit").AuditActor;
  /// Which instalment to raise: 0 for the plan's one-time lines, 1-12 for a
  /// given Nepali month of its monthly lines.
  month?: number;
  issuedOn: Date;
  dueOn: Date | null;
  /// Injectable so tests can bill inside a fixture year that has not arrived
  /// in real time. Mirrors `feeWorkspace`.
  now?: Date;
};

export async function issueStructure(
  structureId: number,
  { month = 0, issuedOn, dueOn, now = new Date(), actor }: IssueOptions,
) {
  if (!Number.isInteger(month) || month < 0 || month > 12) {
    throw new FeeError("A fee is billed once for the year, or for a month from 1 to 12.");
  }

  const structure = await prisma.feeStructure.findUnique({
    where: { id: structureId },
    include: { lines: { include: { feeHead: true } }, academicYear: true },
  });
  if (!structure || !structure.isActive) throw new FeeError("That fee plan is unavailable.");
  if (structure.lines.length === 0) throw new FeeError("Add at least one fee line first.");
  if (dueOn && dueOn < issuedOn) throw new FeeError("The due date cannot fall before the issue date.");

  // A run raises one kind of charge. Billing Bhadra must not re-raise the
  // admission fee, and billing the admission fee must not raise a month.
  const lines = structure.lines.filter((line) =>
    line.feeHead.billingScope === "CLASS" &&
    (month === 0 ? line.feeHead.frequency === "ONE_TIME" : line.feeHead.frequency === "MONTHLY"),
  );
  if (lines.length === 0) return 0;

  const yearBs = Number(structure.academicYear.nameBS);
  // The first day of the month after the one being billed. Used twice: to
  // refuse a month that has not started, and to leave out pupils who join
  // later in the year.
  const monthEnds =
    month === 0
      ? null
      : month === 12
        ? bsToAd({ year: yearBs + 1, month: 1, day: 1 })
        : bsToAd({ year: yearBs, month: month + 1, day: 1 });

  if (month > 0) {
    const monthStarts = bsToAd({ year: yearBs, month, day: 1 });
    if (monthStarts > now) {
      throw new FeeError(`${BS_MONTHS[month - 1]} has not started yet.`);
    }
  }

  return prisma.$transaction(
    async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: {
          academicYearId: structure.academicYearId,
          section: { gradeId: structure.gradeId },
          student: { status: "ACTIVE" },
          // A pupil who joined in Bhadra owes Bhadra onward, not the months
          // before they arrived.
          ...(monthEnds ? { enrolledOn: { lt: monthEnds } } : {}),
          // Filtered in the query, not row by row. The unique index on
          // (enrollmentId, feeStructureId, periodMonth) is what actually
          // guarantees this; the clause just keeps the run from tripping over
          // it.
          invoices: { none: { feeStructureId: structure.id, periodMonth: month } },
        },
        select: { id: true },
      });
      if (enrollments.length === 0) return 0;

      const created = await tx.invoice.createManyAndReturn({
        data: enrollments.map((enrollment) => ({
          enrollmentId: enrollment.id,
          academicYearId: structure.academicYearId,
          feeStructureId: structure.id,
          // Replaced below: the number a parent reads embeds the invoice id,
          // which does not exist until the row does.
          number: `TMP-${randomUUID()}`,
          issuedOn,
          dueOn,
          periodMonth: month,
        })),
        select: { id: true },
      });

      await tx.invoiceLine.createMany({
        data: created.flatMap((invoice) =>
          lines.map((line) => ({
            invoiceId: invoice.id,
            feeHeadId: line.feeHeadId,
            // Copied, not joined: renaming a fee head later must not rewrite
            // what an already-issued invoice says it charged for.
            description: line.feeHead.name,
            amount: line.amount,
          })),
        ),
      });

      await tx.$executeRaw`
        UPDATE "Invoice"
           SET "number" = 'INV-' || ${structure.academicYearId}::text || '-' || lpad(id::text, 5, '0')
         WHERE id IN (${Prisma.join(created.map((invoice) => invoice.id))})
      `;

      if (actor) await writeAuditEvent(tx, actor, {
        action: "invoice.class_issued", entityType: "FeeStructure", entityId: structureId,
        academicYearId: structure.academicYearId, details: { month, invoices: created.length },
      });
      return created.length;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

/// Bills every class of the year for one period.
///
/// A month belongs to the school, not to a class: billing it one plan at a time
/// is what let Bhadra go out for six classes and get missed for the other two.
///
/// Sequential, not concurrent. Each plan opens its own transaction, and a dozen
/// of them contending over the same invoice rows buys nothing a school waiting
/// two seconds would notice.
export async function issueMonth(
  academicYearId: number,
  { month = 0, issuedOn, dueOn, now = new Date(), actor }: IssueOptions,
) {
  const structures = await prisma.feeStructure.findMany({
    where: { academicYearId, isActive: true },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
    select: { id: true, lines: { select: { feeHead: { select: { frequency: true } } } } },
  });

  let invoices = 0;
  let classes = 0;

  for (const structure of structures) {
    // A run raises one kind of charge, so a plan belongs in it when it holds a
    // line of that kind — not when that is the only kind it holds. A plan
    // carrying both tuition and an admission fee is billed by the monthly run
    // for the tuition and by the yearly run for the admission; treating it as
    // "the monthly plan" left its admission fee unbillable from here.
    //
    // issueStructure filters the lines again and would return 0 for a plan
    // with none; skipping them here is what keeps the "3 classes" count honest.
    const wanted = month > 0 ? "MONTHLY" : "ONE_TIME";
    if (!structure.lines.some((line) => line.feeHead.frequency === wanted)) continue;

    const issued = await issueStructure(structure.id, { month, issuedOn, dueOn, now, actor });
    if (issued > 0) classes += 1;
    invoices += issued;
  }

  return { invoices, classes };
}

export async function recordPayment(input: {
  invoiceId: number;
  requestKey?: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER";
  reference?: string;
  receivedById?: number;
  /// Who handed the money over. The guardian link is provenance; the name and
  /// phone are what the receipt prints, snapshotted so reprinting an old
  /// receipt cannot pick up a guardian's newer details.
  paidByGuardianId?: number;
  paidByName?: string;
  paidByPhone?: string;
}, actor?: { userId: number; username: string }) {
  requireWholeRupees(input.amount, "A payment");
  if (input.requestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey)) {
    throw new FeeError("That payment request is invalid. Reopen the collection form.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    invoiceId: input.invoiceId, amount: input.amount, method: input.method,
    reference: input.reference?.trim() || null,
    paidByGuardianId: input.paidByGuardianId ?? null,
    paidByName: input.paidByName?.trim() || null,
    paidByPhone: input.paidByPhone?.trim() || null,
  })).digest("hex");

  return prisma.$transaction(async (tx) => {
    // Lock the invoice before reading its balance. Two clerks taking money at
    // the same counter would otherwise both see the full amount outstanding
    // and between them allocate more than the invoice is worth.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Invoice" WHERE id = ${input.invoiceId} FOR UPDATE
    `;
    if (locked.length === 0) throw new FeeError("That invoice cannot receive a payment.");

    // Retry after a lost response must return the first receipt, even if that
    // payment already settled the invoice. Only the opaque digest is stored.
    if (input.requestKey) {
      const previous = await tx.$queryRaw<{ paymentId: number; fingerprint: string }[]>`
        SELECT "paymentId", "fingerprint" FROM "PaymentRequest" WHERE "key" = ${input.requestKey}
      `;
      if (previous[0]) {
        if (previous[0].fingerprint !== fingerprint) {
          throw new FeeError("This payment request was already used with different details. Check the receipt before starting another payment.");
        }
        return tx.payment.findUniqueOrThrow({ where: { id: previous[0].paymentId } });
      }
    }

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: input.invoiceId },
      include: { lines: { orderBy: { id: "asc" }, include: { allocations: { include: { payment: { select: { status: true } } } } } } },
    });
    if (invoice.status === "CANCELLED") throw new FeeError("That invoice cannot receive a payment.");

    const owed = invoice.lines
      .map((line) => ({ id: line.id, amount: line.amount - settledOnLine(line) }))
      .filter((line) => line.amount > 0);
    const outstanding = owed.reduce((sum, line) => sum + line.amount, 0);
    if (outstanding === 0) throw new FeeError("This invoice is already settled in full.");
    if (input.amount > outstanding) throw new FeeError(`Only ${money(outstanding)} remains on this invoice.`);

    const draft = await tx.payment.create({
      data: {
        academicYearId: invoice.academicYearId,
        receiptNo: `TMP-${randomUUID()}`,
        amount: input.amount,
        paidOn: new Date(),
        method: input.method,
        reference: input.reference?.trim() || null,
        receivedById: input.receivedById ?? null,
        paidByGuardianId: input.paidByGuardianId ?? null,
        paidByName: input.paidByName?.trim() || null,
        paidByPhone: input.paidByPhone?.trim() || null,
      },
    });
    // Take the *updated* row: the caller prints this receipt number, and the
    // pre-update object still carries the placeholder.
    const payment = await tx.payment.update({
      where: { id: draft.id },
      data: { receiptNo: `RCT-${invoice.academicYearId}-${String(draft.id).padStart(5, "0")}` },
    });

    // Oldest line first, so a part payment settles whole lines rather than
    // leaving every line a little short.
    let remaining = input.amount;
    const allocations = [];
    for (const line of owed) {
      const amount = Math.min(remaining, line.amount);
      allocations.push({ paymentId: payment.id, invoiceLineId: line.id, amount });
      remaining -= amount;
      if (remaining === 0) break;
    }
    await tx.paymentAllocation.createMany({ data: allocations });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: input.amount === outstanding ? "PAID" : "PARTIAL" },
    });

    if (input.requestKey) {
      await tx.$executeRaw`
        INSERT INTO "PaymentRequest" ("key", "paymentId", "fingerprint")
        VALUES (${input.requestKey}, ${payment.id}, ${fingerprint})
      `;
    }
    if (actor) {
      await writeAuditEvent(tx, actor, {
        action: "payment.recorded",
        entityType: "Payment",
        entityId: payment.id,
        academicYearId: invoice.academicYearId,
        details: { invoiceId: invoice.id, amount: input.amount, method: input.method },
      });
    }
    return payment;
  });
}
