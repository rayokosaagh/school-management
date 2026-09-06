import { afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { bsToAd } from "@/lib/date/bs";

// Exercise real SQL and foreign keys, but roll back every fixture and bill.
const scope = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => Reflect.get(scope.db as object, key) }) }));
import { issueTransport, saveTransportRegistration, setTransportActive, transportWorkspace } from "./transport";
import { issueStructure } from "./fees";

const client = new PrismaClient();
afterAll(() => client.$disconnect());

it.skipIf(!process.env.DB_TESTS)("registers only selected pupils, snapshots edits, skips legacy/duplicate bills, and separates class charges in real SQL", async () => {
  const rollback = new Error("transport verification rollback");
  await expect(client.$transaction(async (tx) => {
    scope.db = new Proxy(tx, { get: (target, key) => key === "$transaction" ? (fn: (db: Prisma.TransactionClient) => unknown) => fn(tx) : Reflect.get(target, key) });
    const stamp = randomUUID();
    const startsOn = bsToAd({ year: 2098, month: 1, day: 1 });
    const now = bsToAd({ year: 2098, month: 6, day: 1 });
    const year = await tx.academicYear.create({ data: { nameBS: "2098", startsOn, endsOn: now } });
    const grade = await tx.grade.create({ data: { name: `__transport-${stamp}`, order: 987654321 } });
    const section = await tx.section.create({ data: { gradeId: grade.id, academicYearId: year.id, name: "Test" } });
    const pupils: { id: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const student = await tx.student.create({ data: { admissionNo: `${stamp}-${i}`, fullName: `Transport test ${i}`, dob: new Date("2020-01-01"), gender: "OTHER", admittedOn: startsOn } });
      pupils.push(await tx.enrollment.create({ data: { studentId: student.id, academicYearId: year.id, sectionId: section.id, rollNo: i + 1, enrolledOn: startsOn } }));
    }
    const transportHead = await tx.feeHead.create({ data: { name: `__transport-${stamp}`, frequency: "MONTHLY", billingScope: "TRANSPORT" } });
    const classHead = await tx.feeHead.create({ data: { name: `__tuition-${stamp}`, frequency: "MONTHLY" } });
    const structure = await tx.feeStructure.create({ data: { academicYearId: year.id, gradeId: grade.id, name: "Mixed legacy plan", lines: { create: [{ feeHeadId: transportHead.id, amount: 900 }, { feeHeadId: classHead.id, amount: 2000 }] } } });
    const input = { academicYearId: year.id, enrollmentId: pupils[0].id, pickupLocation: "North stop", monthlyAmount: 1500, startMonth: 2, isActive: true };
    await saveTransportRegistration(input);
    await saveTransportRegistration({ ...input, enrollmentId: pupils[1].id });
    await tx.invoice.create({ data: { enrollmentId: pupils[1].id, academicYearId: year.id, feeStructureId: structure.id, number: `__legacy-${stamp}`, periodMonth: 2, issuedOn: startsOn, lines: { create: { feeHeadId: transportHead.id, description: "Legacy transport", amount: 900 } } } });
    expect(await issueTransport(year.id, 1, now)).toBe(0);
    expect(await issueTransport(year.id, 2, now)).toBe(1);
    expect(await issueTransport(year.id, 2, now)).toBe(0);
    expect(await tx.invoice.count({ where: { enrollmentId: pupils[2].id } })).toBe(0);
    const first = await tx.invoice.findFirstOrThrow({ where: { enrollmentId: pupils[0].id, periodMonth: 2 }, include: { lines: true } });
    expect(first.lines[0]).toMatchObject({ amount: 1500, description: expect.stringContaining("North stop") });
    await saveTransportRegistration({ ...input, monthlyAmount: 1800, pickupLocation: "East stop" });
    expect(await issueTransport(year.id, 3, now)).toBe(2);
    const updated = await tx.invoice.findFirstOrThrow({ where: { enrollmentId: pupils[0].id, periodMonth: 3 }, include: { lines: true } });
    expect(updated.lines[0]).toMatchObject({ amount: 1800, description: expect.stringContaining("East stop") });
    expect((await tx.invoiceLine.findUniqueOrThrow({ where: { id: first.lines[0].id } })).amount).toBe(1500);
    await saveTransportRegistration({ ...input, isActive: false });
    expect(await issueTransport(year.id, 4, now)).toBe(1);
    expect(await issueStructure(structure.id, { month: 4, issuedOn: now, dueOn: null, now })).toBe(3);
    const classInvoices = await tx.invoice.findMany({ where: { feeStructureId: structure.id, periodMonth: 4 }, include: { lines: true } });
    expect(classInvoices.every(invoice => invoice.lines.length === 1 && invoice.lines[0].feeHeadId === classHead.id)).toBe(true);
    const workspace = await transportWorkspace(year.id, now);
    expect(workspace.registrations).toHaveLength(2);
    expect(workspace.registrations.find(r => r.enrollmentId === pupils[1].id)?.billedMonths).toEqual([2, 3, 4]);

    // Pausing from the roster takes a status and nothing else: the pickup and
    // price the school already recorded must survive it untouched, which is
    // the whole reason it is not a call to saveTransportRegistration.
    await setTransportActive({ academicYearId: year.id, enrollmentId: pupils[1].id, isActive: false });
    expect(await tx.transportRegistration.findFirstOrThrow({ where: { enrollmentId: pupils[1].id } })).toMatchObject({
      isActive: false, pickupLocation: "North stop", monthlyAmount: 1500, startMonth: 2,
    });
    // Both pupils are paused now, so a run for a fresh month bills nobody —
    // and a paused pupil stays on the roster, which is the only place they
    // can be resumed from.
    expect(await issueTransport(year.id, 5, now)).toBe(0);
    expect((await transportWorkspace(year.id, now)).registrations).toHaveLength(2);

    await setTransportActive({ academicYearId: year.id, enrollmentId: pupils[1].id, isActive: true });
    expect(await issueTransport(year.id, 5, now)).toBe(1);

    // A pupil nobody registered cannot be paused.
    await expect(setTransportActive({ academicYearId: year.id, enrollmentId: pupils[2].id, isActive: false })).rejects.toThrow(/not registered/i);

    throw rollback;
  }, { timeout: 30000 })).rejects.toBe(rollback);
}, 35000);
