import { randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent, type AuditActor } from "@/lib/audit";
import { BS_MONTHS, bsMonthLength, bsToAd } from "@/lib/date/bs";
import { schoolDate } from "@/lib/dashboard/overview";
import { FeeError } from "./fees";

type Frequency = "ONE_TIME" | "MONTHLY";
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
function validId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) throw new FeeError("Choose a valid record.");
}
function validAmount(amount: number) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 2_147_483_647) throw new FeeError("The amount must be a whole number of rupees between 1 and 2,147,483,647.");
}

export async function studentFeeWorkspace(academicYearId: number, now = new Date()) {
  validId(academicYearId);
  const [year, plans, heads, invoices] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { nameBS: true } }),
    prisma.studentFeePlan.findMany({
      where: { academicYearId }, orderBy: [{ feeHead: { name: "asc" } }, { id: "asc" }],
      include: { feeHead: true, assignments: { orderBy: { id: "asc" } } },
    }),
    prisma.feeHead.findMany({
      where: { isActive: true, billingScope: { in: ["CLASS", "STUDENT"] } }, orderBy: { name: "asc" },
      select: { id: true, name: true, frequency: true, billingScope: true },
    }),
    // Cancelled and legacy class bills still count: billing must not silently
    // recreate a charge that was already issued and then cancelled.
    prisma.invoice.findMany({
      where: { academicYearId, lines: { some: { feeHead: { studentFeePlans: { some: { academicYearId } } } } } },
      select: { enrollmentId: true, periodMonth: true, lines: { select: { feeHeadId: true } } },
    }),
  ]);
  if (!year) throw new FeeError("Choose an existing academic year.");
  const billed = new Map<string, Set<number>>();
  for (const invoice of invoices) for (const line of invoice.lines) {
    const key = `${invoice.enrollmentId}:${line.feeHeadId}`;
    const months = billed.get(key) ?? new Set<number>();
    months.add(invoice.periodMonth);
    billed.set(key, months);
  }
  const today = schoolDate(now);
  return {
    plans: plans.map((plan) => ({
      id: plan.id, name: plan.feeHead.name, frequency: plan.feeHead.frequency,
      amount: plan.amount, isActive: plan.isActive,
      selectedIds: plan.assignments.filter((a) => a.isActive).map((a) => a.enrollmentId),
      assignments: plan.assignments.map((a) => ({
        id: a.id, enrollmentId: a.enrollmentId, isActive: a.isActive,
        billedMonths: [...(billed.get(`${a.enrollmentId}:${plan.feeHeadId}`) ?? [])].sort((a, b) => a - b),
      })),
    })),
    heads,
    months: MONTHS.map((month) => ({ month, started: bsToAd({ year: Number(year.nameBS), month, day: 1 }) <= today })),
  };
}

export async function createStudentFeePlan(input: {
  academicYearId: number; name: string; frequency: Frequency; amount: number; convertClassFee: boolean;
}, actor?: AuditActor) {
  validId(input.academicYearId);
  validAmount(input.amount);
  if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 100) throw new FeeError("Enter a fee name between 2 and 100 characters.");
  if (input.frequency !== "ONE_TIME" && input.frequency !== "MONTHLY") throw new FeeError("Choose one-time or monthly billing.");
  if (typeof input.convertClassFee !== "boolean") throw new FeeError("Confirm whether to convert an existing class fee.");
  const name = input.name.trim();

  return prisma.$transaction(async (tx) => {
    // FeeHead has a case-sensitive unique name. Serialize this case-insensitive
    // reuse path so two requests cannot create Library/library separately.
    // The lock function returns PostgreSQL void, which Prisma cannot decode.
    // Acquire the same transaction lock but return a supported integer column.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${name.toLowerCase()}))`;
    const year = await tx.academicYear.findUnique({ where: { id: input.academicYearId }, select: { id: true } });
    if (!year) throw new FeeError("Choose an existing academic year.");
    let head = await tx.feeHead.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, orderBy: { id: "asc" } });
    if (head) {
      if (head.billingScope === "TRANSPORT") throw new FeeError("Manage transportation through transport registrations.");
      if (!head.isActive) throw new FeeError("Activate this fee type before creating a student fee plan.");
      if (head.frequency !== input.frequency) throw new FeeError("The frequency must match the existing fee type.");
      if (head.billingScope === "CLASS") {
        if (!input.convertClassFee) throw new FeeError("Confirm conversion of this class fee to selected-student billing.");
        // Keep existing class lines and invoice snapshots for their history.
        head = await tx.feeHead.update({ where: { id: head.id }, data: { billingScope: "STUDENT" } });
      }
    } else {
      head = await tx.feeHead.create({ data: { name, frequency: input.frequency, billingScope: "STUDENT" } });
    }
    const existing = await tx.studentFeePlan.findUnique({ where: { academicYearId_feeHeadId: { academicYearId: input.academicYearId, feeHeadId: head.id } }, select: { id: true } });
    if (existing) throw new FeeError("This fee already has a student plan for the selected year. Edit that plan instead.");
    const saved = await tx.studentFeePlan.create({ data: { academicYearId: input.academicYearId, feeHeadId: head.id, amount: input.amount } });
    if (actor) await writeAuditEvent(tx, actor, {
      action: "service.created", entityType: "StudentFeePlan", entityId: saved.id,
      academicYearId: input.academicYearId, details: { feeHeadId: head.id, amount: input.amount, convertedClassFee: input.convertClassFee },
    });
    return saved;
  });
}

export async function saveStudentFeePlan(input: {
  academicYearId: number; planId: number; amount: number; isActive: boolean; enrollmentIds: number[];
}, actor?: AuditActor) {
  validId(input.academicYearId);
  validId(input.planId);
  validAmount(input.amount);
  if (typeof input.isActive !== "boolean" || !Array.isArray(input.enrollmentIds)) throw new FeeError("Choose a valid student selection and plan status.");
  input.enrollmentIds.forEach(validId);
  const enrollmentIds = [...new Set(input.enrollmentIds)];
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StudentFeePlan" WHERE id = ${input.planId} AND "academicYearId" = ${input.academicYearId} FOR UPDATE`;
    const plan = await tx.studentFeePlan.findFirst({ where: { id: input.planId, academicYearId: input.academicYearId }, include: { feeHead: true } });
    if (!plan || plan.feeHead.billingScope !== "STUDENT") throw new FeeError("Choose a student fee plan in the selected academic year.");
    const enrollments = await tx.enrollment.findMany({ where: { id: { in: enrollmentIds }, academicYearId: input.academicYearId, student: { status: "ACTIVE" } }, select: { id: true } });
    if (enrollments.length !== enrollmentIds.length) throw new FeeError("Select only active students enrolled in this academic year.");
    await tx.studentFeeAssignment.updateMany({ where: { planId: plan.id, enrollmentId: { notIn: enrollmentIds } }, data: { isActive: false } });
    // Deactivate rather than delete: invoices must retain their assignment.
    if (enrollmentIds.length > 0) {
      await tx.studentFeeAssignment.createMany({ data: enrollmentIds.map((enrollmentId) => ({ planId: plan.id, enrollmentId })), skipDuplicates: true });
      await tx.studentFeeAssignment.updateMany({ where: { planId: plan.id, enrollmentId: { in: enrollmentIds } }, data: { isActive: true } });
    }
    const saved = await tx.studentFeePlan.update({ where: { id: plan.id }, data: { amount: input.amount, isActive: input.isActive } });
    if (actor) await writeAuditEvent(tx, actor, {
      action: "service.updated", entityType: "StudentFeePlan", entityId: plan.id,
      academicYearId: input.academicYearId, details: { amount: input.amount, active: input.isActive, students: enrollmentIds.length },
    });
    return saved;
  });
}

export async function issueStudentFeePlan(academicYearId: number, planId: number, month: number, now = new Date(), actor?: AuditActor) {
  validId(academicYearId);
  validId(planId);
  if (!Number.isInteger(month) || month < 0 || month > 12) throw new FeeError("Choose a billing month from 1 to 12, or 0 for a one-time fee.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StudentFeePlan" WHERE id = ${planId} AND "academicYearId" = ${academicYearId} FOR UPDATE`;
    const plan = await tx.studentFeePlan.findFirst({ where: { id: planId, academicYearId }, include: { feeHead: true, academicYear: true } });
    if (!plan || !plan.isActive || !plan.feeHead.isActive || plan.feeHead.billingScope !== "STUDENT") throw new FeeError("That student fee plan is unavailable.");
    if ((plan.feeHead.frequency === "ONE_TIME" && month !== 0) || (plan.feeHead.frequency === "MONTHLY" && month === 0) || !["ONE_TIME", "MONTHLY"].includes(plan.feeHead.frequency)) {
      throw new FeeError("Choose a billing period matching this fee's frequency.");
    }
    const issuedOn = schoolDate(now);
    const yearBs = Number(plan.academicYear.nameBS);
    let monthEnd: Date | undefined;
    if (month > 0) {
      if (bsToAd({ year: yearBs, month, day: 1 }) > issuedOn) throw new FeeError(`${BS_MONTHS[month - 1]} has not started yet.`);
      monthEnd = bsToAd({ year: yearBs, month, day: bsMonthLength(yearBs, month) });
    }
    const assignments = await tx.studentFeeAssignment.findMany({
      where: {
        planId, isActive: true,
        enrollment: {
          academicYearId, student: { status: "ACTIVE" }, ...(monthEnd ? { enrolledOn: { lte: monthEnd } } : {}),
          // Includes legacy class and cancelled invoices; neither can be
          // silently rebilled after converting to student selection.
          invoices: { none: { academicYearId, periodMonth: month, lines: { some: { feeHeadId: plan.feeHeadId } } } },
        },
      },
      select: { id: true, enrollmentId: true }, orderBy: { id: "asc" },
    });
    if (assignments.length === 0) return 0;
    const created = await tx.invoice.createManyAndReturn({
      data: assignments.map((a) => ({ enrollmentId: a.enrollmentId, academicYearId, studentFeeAssignmentId: a.id, periodMonth: month, number: `TMP-${randomUUID()}`, issuedOn, dueOn: null })),
      skipDuplicates: true, select: { id: true },
    });
    if (created.length === 0) return 0;
    await tx.invoiceLine.createMany({ data: created.map((invoice) => ({ invoiceId: invoice.id, feeHeadId: plan.feeHeadId, description: plan.feeHead.name, amount: plan.amount })) });
    await tx.$executeRaw`
      UPDATE "Invoice"
      SET "number" = 'INV-' || ${academicYearId}::text || '-' || lpad(id::text, 5, '0')
      WHERE id IN (${Prisma.join(created.map((invoice) => invoice.id))})
    `;
    if (actor) await writeAuditEvent(tx, actor, {
      action: "invoice.service_issued", entityType: "StudentFeePlan", entityId: planId,
      academicYearId, details: { month, invoices: created.length },
    });
    return created.length;
  }, { timeout: 120_000, maxWait: 10_000 });
}

/// Takes pupils off a service for good, rather than pausing them.
///
/// Only where nothing has been billed. An assignment that carried an invoice
/// has to stay: the bill points at it, and deleting it would leave a charge
/// nobody can trace back to the service that raised it. Pausing is the answer
/// for those, which is why this returns what it refused as well as what it
/// removed — the caller says so rather than silently doing less than asked.
export async function unregisterStudentFeePlan(input: {
  academicYearId: number;
  planId: number;
  enrollmentIds: number[];
}, actor?: AuditActor) {
  validId(input.academicYearId);
  validId(input.planId);
  if (!Array.isArray(input.enrollmentIds) || input.enrollmentIds.length === 0) {
    throw new FeeError("Choose at least one student to unregister.");
  }
  input.enrollmentIds.forEach(validId);
  const enrollmentIds = [...new Set(input.enrollmentIds)];

  return prisma.$transaction(async (tx) => {
    const plan = await tx.studentFeePlan.findFirst({
      where: { id: input.planId, academicYearId: input.academicYearId },
      include: { feeHead: true },
    });
    if (!plan || plan.feeHead.billingScope !== "STUDENT") {
      throw new FeeError("Choose a student fee plan in the selected academic year.");
    }

    // Billed at any point this year, on this fee, by any route — a plan bill
    // or an older class-wide one that happened to carry the same fee.
    const billed = await tx.invoice.findMany({
      where: {
        academicYearId: input.academicYearId,
        enrollmentId: { in: enrollmentIds },
        lines: { some: { feeHeadId: plan.feeHeadId } },
      },
      select: { enrollmentId: true },
    });
    const keep = new Set(billed.map((invoice) => invoice.enrollmentId));
    const removable = enrollmentIds.filter((id) => !keep.has(id));

    const removed = removable.length === 0
      ? { count: 0 }
      : await tx.studentFeeAssignment.deleteMany({
          where: { planId: plan.id, enrollmentId: { in: removable } },
        });

    if (actor && removed.count > 0) await writeAuditEvent(tx, actor, {
      action: "service.unregistered", entityType: "StudentFeePlan", entityId: plan.id,
      academicYearId: input.academicYearId,
      details: { removed: removed.count, keptBecauseBilled: keep.size },
    });

    return { removed: removed.count, keptBecauseBilled: keep.size };
  });
}
