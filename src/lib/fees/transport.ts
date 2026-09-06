import { randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent, type AuditActor } from "@/lib/audit";
import { BS_MONTHS, bsMonthLength, bsToAd } from "@/lib/date/bs";
import { schoolDate } from "@/lib/dashboard/overview";
import { FeeError } from "./fees";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export async function transportWorkspace(academicYearId: number, now = new Date()) {
  const [year, enrollments, registrations] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { nameBS: true } }),
    prisma.enrollment.findMany({
      where: { academicYearId, student: { status: "ACTIVE" } },
      select: { id: true, student: { select: { fullName: true, admissionNo: true } }, section: { select: { name: true, grade: { select: { name: true } } } } },
      orderBy: [{ section: { grade: { order: "asc" } } }, { rollNo: "asc" }],
    }),
    prisma.transportRegistration.findMany({
      where: { enrollment: { academicYearId } },
      orderBy: [{ enrollment: { student: { fullName: "asc" } } }, { id: "asc" }],
      include: { enrollment: { select: {
        student: { select: { fullName: true, admissionNo: true } },
        section: { select: { name: true, grade: { select: { name: true } } } },
        invoices: {
          where: { academicYearId, periodMonth: { gt: 0 }, OR: [
            { transportRegistrationId: { not: null } },
            { lines: { some: { feeHead: { billingScope: "TRANSPORT" } } } },
          ] },
          select: { periodMonth: true },
        },
      } } },
    }),
  ]);
  if (!year) throw new FeeError("Choose an existing academic year.");
  const today = schoolDate(now);
  return {
    enrollments: enrollments.map((e) => ({ id: e.id, name: e.student.fullName, admissionNo: e.student.admissionNo, section: `${e.section.grade.name} ${e.section.name}` })),
    registrations: registrations.map((r) => ({
      id: r.id, enrollmentId: r.enrollmentId, pickupLocation: r.pickupLocation,
      monthlyAmount: r.monthlyAmount, startMonth: r.startMonth, isActive: r.isActive,
      name: r.enrollment.student.fullName, admissionNo: r.enrollment.student.admissionNo,
      section: `${r.enrollment.section.grade.name} ${r.enrollment.section.name}`,
      billedMonths: [...new Set(r.enrollment.invoices.map((invoice) => invoice.periodMonth))].sort((a, b) => a - b),
    })),
    months: MONTHS.map((month) => ({ month, started: bsToAd({ year: Number(year.nameBS), month, day: 1 }) <= today })),
  };
}

export type TransportRegistrationInput = {
  academicYearId: number;
  enrollmentId: number;
  pickupLocation: string;
  monthlyAmount: number;
  startMonth: number;
  isActive: boolean;
};

export async function saveTransportRegistration(input: TransportRegistrationInput, actor?: AuditActor) {
  if (!Number.isInteger(input.academicYearId) || input.academicYearId < 1 || !Number.isInteger(input.enrollmentId) || input.enrollmentId < 1) {
    throw new FeeError("Choose a student in the selected academic year.");
  }
  const pickupLocation = input.pickupLocation.trim();
  if (pickupLocation.length < 2 || pickupLocation.length > 160) throw new FeeError("Enter a pickup location between 2 and 160 characters.");
  if (!Number.isInteger(input.monthlyAmount) || input.monthlyAmount < 1 || input.monthlyAmount > 2_147_483_647) {
    throw new FeeError("The monthly transport amount must be a whole number of rupees between 1 and 2,147,483,647.");
  }
  requireMonth(input.startMonth);
  if (typeof input.isActive !== "boolean") throw new FeeError("Choose whether transport is active.");

  return prisma.$transaction(async (tx) => {
    // A registration may not exist yet. Locking its enrollment serializes two
    // first registrations as well as updates; upsert then locks an existing
    // registration against billing before its price or pickup can change.
    await tx.$queryRaw`SELECT id FROM "Enrollment" WHERE id = ${input.enrollmentId} FOR NO KEY UPDATE`;
    const enrollment = await tx.enrollment.findFirst({
      where: { id: input.enrollmentId, academicYearId: input.academicYearId, student: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (!enrollment) throw new FeeError("Choose an active student enrolled in the selected academic year.");
    const values = { pickupLocation, monthlyAmount: input.monthlyAmount, startMonth: input.startMonth, isActive: input.isActive };
    const saved = await tx.transportRegistration.upsert({
      where: { enrollmentId: enrollment.id },
      create: { enrollmentId: enrollment.id, ...values },
      update: values,
    });
    if (actor) await writeAuditEvent(tx, actor, {
      action: "transport.saved", entityType: "TransportRegistration", entityId: saved.id,
      academicYearId: input.academicYearId,
      details: { enrollmentId: input.enrollmentId, amount: input.monthlyAmount, startMonth: input.startMonth, active: input.isActive },
    });
    return saved;
  });
}

/// Pauses or resumes one pupil's transport, and nothing else.
///
/// Its own function rather than a call to `saveTransportRegistration`, which
/// demands a pickup location, a price and a start month: pausing a pupil for a
/// term should not require restating what the school already knows, and a
/// round trip through those fields is a round trip that can change them.
export async function setTransportActive(input: {
  academicYearId: number;
  enrollmentId: number;
  isActive: boolean;
}, actor?: AuditActor) {
  if (!Number.isInteger(input.academicYearId) || input.academicYearId < 1 || !Number.isInteger(input.enrollmentId) || input.enrollmentId < 1) {
    throw new FeeError("Choose a student in the selected academic year.");
  }
  if (typeof input.isActive !== "boolean") throw new FeeError("Choose whether transport is active.");

  return prisma.$transaction(async (tx) => {
    const registration = await tx.transportRegistration.findFirst({
      where: { enrollmentId: input.enrollmentId, enrollment: { academicYearId: input.academicYearId } },
      select: { id: true },
    });
    if (!registration) throw new FeeError("That student is not registered for transport.");
    const saved = await tx.transportRegistration.update({
      where: { id: registration.id },
      data: { isActive: input.isActive },
    });
    if (actor) await writeAuditEvent(tx, actor, {
      action: "transport.status_changed", entityType: "TransportRegistration", entityId: registration.id,
      academicYearId: input.academicYearId, details: { active: input.isActive },
    });
    return saved;
  });
}

function requireMonth(month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new FeeError("Choose a Nepali month from 1 to 12.");
}

/// One invoice per registered pupil and BS month. Invoice lines snapshot the
/// registered price and pickup; editing a registration never rewrites debt.
export async function issueTransport(academicYearId: number, month: number, now = new Date(), actor?: AuditActor) {
  requireMonth(month);
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { nameBS: true } });
  if (!year) throw new FeeError("Choose an existing academic year.");
  const yearBs = Number(year.nameBS);
  const issuedOn = schoolDate(now);
  if (bsToAd({ year: yearBs, month, day: 1 }) > issuedOn) throw new FeeError(`${BS_MONTHS[month - 1]} has not started yet.`);
  const monthEnd = bsToAd({ year: yearBs, month, day: bsMonthLength(yearBs, month) });

  return prisma.$transaction(async (tx) => {
    // Read current registration values only after acquiring the locks. A
    // second billing run waits here and then sees the first run's invoices.
    await tx.$queryRaw`
      SELECT r.id FROM "TransportRegistration" r
      JOIN "Enrollment" e ON e.id = r."enrollmentId"
      WHERE e."academicYearId" = ${academicYearId}
      ORDER BY r.id FOR UPDATE OF r
    `;
    const registrations = await tx.transportRegistration.findMany({
      where: {
        isActive: true, startMonth: { lte: month },
        enrollment: {
          academicYearId, student: { status: "ACTIVE" }, enrolledOn: { lte: monthEnd },
          // Legacy class bills, and cancelled bills, block another charge.
          // Checking only registrationId would rebill migrated transport.
          invoices: { none: { academicYearId, periodMonth: month, OR: [
            { transportRegistrationId: { not: null } },
            { lines: { some: { feeHead: { billingScope: "TRANSPORT" } } } },
          ] } },
        },
      },
      select: { id: true, enrollmentId: true, monthlyAmount: true, pickupLocation: true },
      orderBy: { id: "asc" },
    });
    if (registrations.length === 0) return 0;
    const head = await tx.feeHead.findFirst({ where: { billingScope: "TRANSPORT" }, orderBy: { id: "asc" }, select: { id: true, name: true } })
      ?? await tx.feeHead.upsert({
        where: { name: "Transportation" },
        create: { name: "Transportation", frequency: "MONTHLY", billingScope: "TRANSPORT" },
        update: { frequency: "MONTHLY", billingScope: "TRANSPORT" },
        select: { id: true, name: true },
      });
    const created = await tx.invoice.createManyAndReturn({
      data: registrations.map((r) => ({
        enrollmentId: r.enrollmentId, academicYearId, transportRegistrationId: r.id,
        number: `TMP-${randomUUID()}`, issuedOn, dueOn: null, periodMonth: month,
      })),
      skipDuplicates: true,
      select: { id: true, transportRegistrationId: true },
    });
    if (created.length === 0) return 0;
    const registrationById = new Map(registrations.map((r) => [r.id, r]));
    await tx.invoiceLine.createMany({ data: created.map((invoice) => {
      const registration = registrationById.get(invoice.transportRegistrationId!)!;
      return {
        invoiceId: invoice.id, feeHeadId: head.id,
        description: `${head.name} — ${registration.pickupLocation}`,
        amount: registration.monthlyAmount,
      };
    }) });
    await tx.$executeRaw`
      UPDATE "Invoice"
      SET "number" = 'INV-' || ${academicYearId}::text || '-' || lpad(id::text, 5, '0')
      WHERE id IN (${Prisma.join(created.map((invoice) => invoice.id))})
    `;
    if (actor) await writeAuditEvent(tx, actor, {
      action: "invoice.transport_issued", entityType: "AcademicYear", entityId: academicYearId,
      academicYearId, details: { month, invoices: created.length },
    });
    return created.length;
  }, { timeout: 120_000, maxWait: 10_000 });
}
