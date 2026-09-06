import { afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { bsToAd } from "@/lib/date/bs";

const scope = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => Reflect.get(scope.db as object, key) }) }));
import { createStudentFeePlan, saveStudentFeePlan, issueStudentFeePlan, studentFeeWorkspace, unregisterStudentFeePlan } from "./student-fees";
import { issueStructure } from "./fees";
const client = new PrismaClient();
afterAll(() => client.$disconnect());

// All records and invoices are test-only and roll back even on assertion failure.
it.skipIf(!process.env.DB_TESTS)("bills selected students only and preserves legacy class charges, prices and snapshots", async () => {
  const rollback = new Error("service test rollback");
  await expect(client.$transaction(async tx => {
    scope.db = new Proxy(tx, { get: (target, key) => key === "$transaction" ? (fn: (db: Prisma.TransactionClient) => unknown) => fn(tx) : Reflect.get(target, key) });
    const stamp = randomUUID();
    const startsOn = bsToAd({ year: 2098, month: 1, day: 1 });
    const now = bsToAd({ year: 2098, month: 6, day: 1 });
    const year = await tx.academicYear.create({ data: { nameBS: "2098", startsOn, endsOn: now } });
    const grade = await tx.grade.create({ data: { name: `__service-${stamp}`, order: 987654322 } });
    const section = await tx.section.create({ data: { gradeId: grade.id, academicYearId: year.id, name: "Test" } });
    const pupils: { id: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const student = await tx.student.create({ data: { admissionNo: `${stamp}-${i}`, fullName: `Service test ${i}`, dob: new Date("2020-01-01"), gender: "OTHER", admittedOn: startsOn } });
      pupils.push(await tx.enrollment.create({ data: { studentId: student.id, academicYearId: year.id, sectionId: section.id, rollNo: i + 1, enrolledOn: startsOn } }));
    }
    const head = await tx.feeHead.create({ data: { name: `Library-${stamp}`, frequency: "MONTHLY", billingScope: "CLASS" } });
    const classPlan = await tx.feeStructure.create({ data: { academicYearId: year.id, gradeId: grade.id, name: "Library class plan", lines: { create: { feeHeadId: head.id, amount: 400 } } } });
    const legacy = await tx.invoice.create({ data: { enrollmentId: pupils[0].id, academicYearId: year.id, feeStructureId: classPlan.id, number: `__legacy-${stamp}`, periodMonth: 2, issuedOn: startsOn, lines: { create: { feeHeadId: head.id, description: "Legacy library", amount: 400 } } }, include: { lines: true } });
    await expect(createStudentFeePlan({ academicYearId: year.id, name: head.name, frequency: "MONTHLY", amount: 500, convertClassFee: false })).rejects.toThrow("Confirm conversion");
    expect((await tx.feeHead.findUniqueOrThrow({ where: { id: head.id } })).billingScope).toBe("CLASS");
    const plan = await createStudentFeePlan({ academicYearId: year.id, name: head.name, frequency: "MONTHLY", amount: 500, convertClassFee: true });
    const input = { academicYearId: year.id, planId: plan.id, amount: 500, isActive: true, enrollmentIds: [pupils[0].id, pupils[1].id] };
    await saveStudentFeePlan(input);
    expect(await issueStructure(classPlan.id, { month: 3, issuedOn: now, dueOn: null, now })).toBe(0);
    expect(await issueStudentFeePlan(year.id, plan.id, 2, now)).toBe(1);
    expect(await issueStudentFeePlan(year.id, plan.id, 2, now)).toBe(0);
    expect(await tx.invoice.count({ where: { enrollmentId: pupils[2].id } })).toBe(0);
    await saveStudentFeePlan({ ...input, amount: 700, enrollmentIds: [pupils[1].id] });
    expect(await issueStudentFeePlan(year.id, plan.id, 3, now)).toBe(1);
    const invoice = await tx.invoice.findFirstOrThrow({ where: { enrollmentId: pupils[1].id, periodMonth: 3 }, include: { lines: true } });
    expect(invoice.lines[0].amount).toBe(700);
    expect((await tx.invoiceLine.findUniqueOrThrow({ where: { id: legacy.lines[0].id } })).amount).toBe(400);
    expect((await tx.feeStructureLine.findFirstOrThrow({ where: { feeStructureId: classPlan.id } })).amount).toBe(400);
    expect(await tx.studentFeeAssignment.count({ where: { planId: plan.id } })).toBe(2);
    const workspace = await studentFeeWorkspace(year.id, now);
    expect(workspace.plans[0].selectedIds).toEqual([pupils[1].id]);
    expect(workspace.plans[0].assignments.find(assignment => assignment.enrollmentId === pupils[0].id)?.billedMonths).toEqual([2]);
    await saveStudentFeePlan({ ...input, isActive: false });
    await expect(issueStudentFeePlan(year.id, plan.id, 4, now)).rejects.toThrow("unavailable");
    throw rollback;
  }, { timeout: 30000 })).rejects.toBe(rollback);
}, 35000);

// Unregistering removes a pupil from a service for good, which is only safe
// while nothing has been billed to them for it.
it.skipIf(!process.env.DB_TESTS)("unregisters only the pupils no bill points at", async () => {
  const rollback = new Error("unregister test rollback");
  await expect(client.$transaction(async tx => {
    scope.db = new Proxy(tx, { get: (target, key) => key === "$transaction" ? (fn: (db: Prisma.TransactionClient) => unknown) => fn(tx) : Reflect.get(target, key) });
    const stamp = randomUUID();
    const startsOn = bsToAd({ year: 2097, month: 1, day: 1 });
    const now = bsToAd({ year: 2097, month: 6, day: 1 });
    const year = await tx.academicYear.create({ data: { nameBS: "2097", startsOn, endsOn: now } });
    const grade = await tx.grade.create({ data: { name: `__unreg-${stamp}`, order: 987654323 } });
    const section = await tx.section.create({ data: { gradeId: grade.id, academicYearId: year.id, name: "Test" } });
    const pupils: { id: number }[] = [];
    for (let i = 0; i < 2; i++) {
      const student = await tx.student.create({ data: { admissionNo: `${stamp}-${i}`, fullName: `Unreg test ${i}`, dob: new Date("2020-01-01"), gender: "OTHER", admittedOn: startsOn } });
      pupils.push(await tx.enrollment.create({ data: { studentId: student.id, academicYearId: year.id, sectionId: section.id, rollNo: i + 1, enrolledOn: startsOn } }));
    }
    const plan = await createStudentFeePlan({
      academicYearId: year.id, name: `Unreg-${stamp}`, frequency: "MONTHLY", amount: 500, convertClassFee: false,
    });
    const input = { academicYearId: year.id, planId: plan.id, amount: 500, isActive: true, enrollmentIds: [pupils[0].id, pupils[1].id] };
    await saveStudentFeePlan(input);

    // Bill the first pupil only. From here on their assignment is load-bearing:
    // an invoice points at it.
    await saveStudentFeePlan({ ...input, enrollmentIds: [pupils[0].id] });
    expect(await issueStudentFeePlan(year.id, plan.id, 2, now)).toBe(1);
    await saveStudentFeePlan(input);

    const result = await unregisterStudentFeePlan({
      academicYearId: year.id, planId: plan.id, enrollmentIds: [pupils[0].id, pupils[1].id],
    });

    // One removed, one refused — and the caller is told, rather than the
    // refusal passing as success.
    expect(result).toEqual({ removed: 1, keptBecauseBilled: 1 });
    const left = await tx.studentFeeAssignment.findMany({ where: { planId: plan.id }, select: { enrollmentId: true } });
    expect(left.map(a => a.enrollmentId)).toEqual([pupils[0].id]);

    // Asking again removes nothing: there is nobody left who can go.
    expect(await unregisterStudentFeePlan({
      academicYearId: year.id, planId: plan.id, enrollmentIds: [pupils[0].id],
    })).toEqual({ removed: 0, keptBecauseBilled: 1 });

    // And the bill it protected is untouched.
    expect(await tx.invoice.count({ where: { enrollmentId: pupils[0].id, academicYearId: year.id } })).toBe(1);
    throw rollback;
  }, { timeout: 30000 })).rejects.toBe(rollback);
}, 35000);
