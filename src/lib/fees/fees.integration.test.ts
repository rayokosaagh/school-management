import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent } from "@/lib/registry/students";
import {
  FeeError,
  createFeeHead,
  createFeeStructure,
  feeWorkspace,
  issueStructure,
  pupilFees,
  recordPayment,
  setFeeAmounts,
  setFeeNote,
  unbilledMonthCount,
} from "./fees";
import { invoiceDocument, receiptDocument, statementDocument } from "./documents";

const BS = 2094;
const CLASS_SIZE = 45;

const made = {
  yearId: 0,
  gradeId: 0,
  emptyGradeId: 0,
  unbilledGradeId: 0,
  sectionId: 0,
  unbilledSectionId: 0,
  headIds: [] as number[],
  structureIds: [] as number[],
  studentIds: [] as number[],
  leftStudentId: 0,
  unbilledStudentId: 0,
};

const stamp = Date.now() % 1000000;

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
  made.gradeId = (await createGrade({ name: `__fee Class 5 ${stamp}`, order: 9971 })).id;
  made.emptyGradeId = (await createGrade({ name: `__fee Class 9 ${stamp}`, order: 9972 })).id;
  // A grade nobody ever writes a structure for: its pupils stay active and
  // unbilled all year, which is what the balances list has to surface.
  made.unbilledGradeId = (await createGrade({ name: `__fee Class 7 ${stamp}`, order: 9973 })).id;
  made.sectionId = (
    await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })
  ).id;
  made.unbilledSectionId = (
    await createSection({ name: "A", gradeId: made.unbilledGradeId, academicYearId: made.yearId })
  ).id;

  // A class larger than one round of batching, so issuing exercises the bulk
  // path rather than a handful of rows.
  for (let i = 0; i < CLASS_SIZE; i++) {
    const student = await createStudent({
      admissionNo: `__fee-${stamp}-${i}`,
      firstName: "__fee",
      lastName: `Student${i}`,
      dob: new Date(Date.UTC(2013, 0, 1)),
      gender: "MALE",
      admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
      guardians: [{ relation: "FATHER", fullName: "__fee Dad", phone: "9800000022" }],
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    });
    made.studentIds.push(student.id);
  }

  // Enrolled but no longer at the school: must never be invoiced.
  const left = await createStudent({
    admissionNo: `__fee-${stamp}-left`,
    firstName: "__fee",
    lastName: "Departed",
    dob: new Date(Date.UTC(2013, 0, 1)),
    gender: "FEMALE",
    admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
    guardians: [{ relation: "MOTHER", fullName: "__fee Mum", phone: "9800000023" }],
    enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
  });
  made.leftStudentId = left.id;
  made.studentIds.push(left.id);
  await prisma.student.update({ where: { id: left.id }, data: { status: "LEFT" } });

  // Active, enrolled, and in a grade with no fee structure: billable, but not
  // yet billed.
  const unbilled = await createStudent({
    admissionNo: `__fee-${stamp}-unbilled`,
    firstName: "__fee",
    lastName: "Unbilled",
    dob: new Date(Date.UTC(2013, 0, 1)),
    gender: "MALE",
    admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
    guardians: [{ relation: "FATHER", fullName: "__fee Dad", phone: "9800000024" }],
    enrollment: { sectionId: made.unbilledSectionId, academicYearId: made.yearId },
  });
  made.unbilledStudentId = unbilled.id;
  made.studentIds.push(unbilled.id);

});

afterAll(async () => {
  const invoices = await prisma.invoice.findMany({
    where: { academicYearId: made.yearId },
    select: { id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);
  await prisma.paymentAllocation.deleteMany({
    where: { invoiceLine: { invoiceId: { in: invoiceIds } } },
  });
  await prisma.payment.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.feeStructureLine.deleteMany({
    where: { feeStructureId: { in: made.structureIds } },
  });
  await prisma.feeStructure.deleteMany({ where: { id: { in: made.structureIds } } });
  await prisma.feeHead.deleteMany({ where: { id: { in: made.headIds } } });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  await prisma.section.deleteMany({
    where: { id: { in: [made.sectionId, made.unbilledSectionId] } },
  });
  await prisma.grade.deleteMany({
    where: { id: { in: [made.gradeId, made.emptyGradeId, made.unbilledGradeId] } },
  });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("fee setup", () => {
  it("rejects a blank fee head and keeps a real one", async () => {
    await expect(createFeeHead(" ")).rejects.toBeInstanceOf(FeeError);

    for (const name of ["Tuition", "Exam"]) {
      const head = await createFeeHead(`__fee ${name} ${stamp}`);
      made.headIds.push(head.id);
      expect(head.isActive).toBe(true);
    }
  });

  it("rejects a structure with a nonsense amount", async () => {
    const base = {
      academicYearId: made.yearId,
      gradeId: made.gradeId,
      name: "__fee bad",
    };
    const line = (amount: number) => [{ feeHeadId: made.headIds[0], amount }];
    await expect(createFeeStructure({ ...base, lines: line(0) })).rejects.toBeInstanceOf(FeeError);
    await expect(createFeeStructure({ ...base, lines: line(12.5) })).rejects.toBeInstanceOf(FeeError);
    await expect(createFeeStructure({ ...base, lines: [] })).rejects.toBeInstanceOf(FeeError);
    await expect(
      createFeeStructure({ ...base, lines: line(100), name: "x" }),
    ).rejects.toBeInstanceOf(FeeError);
    // The same head twice would collide on the structure's unique index.
    await expect(
      createFeeStructure({ ...base, lines: [...line(100), ...line(200)] }),
    ).rejects.toBeInstanceOf(FeeError);
  });

  it("creates a multi-line structure for a grade", async () => {
    const structure = await createFeeStructure({
      academicYearId: made.yearId,
      gradeId: made.gradeId,
      lines: [
        { feeHeadId: made.headIds[0], amount: 700 },
        { feeHeadId: made.headIds[1], amount: 300 },
      ],
      name: `__fee Annual ${stamp}`,
    });
    made.structureIds.push(structure.id);

    const lines = await prisma.feeStructureLine.findMany({
      where: { feeStructureId: structure.id },
    });
    expect(lines).toHaveLength(2);
    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(1000);
  });
});

describe.skipIf(!process.env.DB_TESTS)("issuing invoices", () => {
  it("invoices every active enrolment in the grade, once", async () => {
    const issued = await issueStructure(made.structureIds[0], { issuedOn: new Date(), dueOn: null });
    expect(issued).toBe(CLASS_SIZE);

    // Idempotent: a second run adds nothing.
    expect(await issueStructure(made.structureIds[0], { issuedOn: new Date(), dueOn: null })).toBe(0);

    const invoices = await prisma.invoice.findMany({
      where: { feeStructureId: made.structureIds[0] },
      include: { enrollment: true, lines: true },
    });
    expect(invoices).toHaveLength(CLASS_SIZE);
    // The student who left is enrolled but not billed.
    expect(invoices.some((i) => i.enrollment.studentId === made.leftStudentId)).toBe(false);
    // Every invoice carries its line and a real, unique number.
    // Both structure lines are copied onto every invoice, with the fee-head
    // name frozen into the description.
    expect(invoices.every((i) => i.lines.length === 2)).toBe(true);
    expect(invoices.every((i) => i.lines.reduce((sum, l) => sum + l.amount, 0) === 1000)).toBe(true);
    expect(invoices.every((i) => /^INV-\d+-\d{5}$/.test(i.number))).toBe(true);
    expect(new Set(invoices.map((i) => i.number)).size).toBe(CLASS_SIZE);
  });

  it("refuses a structure with nobody to bill or no lines", async () => {
    const empty = await createFeeStructure({
      academicYearId: made.yearId,
      gradeId: made.emptyGradeId,
      lines: [{ feeHeadId: made.headIds[0], amount: 500 }],
      name: `__fee Empty ${stamp}`,
    });
    made.structureIds.push(empty.id);
    expect(await issueStructure(empty.id, { issuedOn: new Date(), dueOn: null })).toBe(0);

    await expect(issueStructure(-1, { issuedOn: new Date(), dueOn: null })).rejects.toBeInstanceOf(FeeError);
  });
});

/// Monthly billing gets its own academic year. `feeWorkspace` totals a whole
/// year, so pupils added here would otherwise move the numbers the workspace
/// tests assert on — and only once these tests had run, making those
/// assertions depend on execution order.
describe.skipIf(!process.env.DB_TESTS)("monthly instalments", () => {
  const MBS = 2095;
  /// Inside Bhadra (month 5) of that year. Issuing refuses a month that has
  /// not started, and the fixture year is far in the future, so every call
  /// here has to say when "now" is.
  const inBhadra = bsToAd({ year: MBS, month: 5, day: 20 });

  const m = { yearId: 0, gradeId: 0, sectionId: 0, headId: 0, structureId: 0, studentIds: [] as number[] };

  beforeAll(async () => {
    m.yearId = (await createAcademicYear({ nameBS: String(MBS) })).id;
    m.gradeId = (await createGrade({ name: `__fee Class 8 ${stamp}`, order: 9974 })).id;
    m.sectionId = (
      await createSection({ name: "A", gradeId: m.gradeId, academicYearId: m.yearId })
    ).id;

    // One pupil here from Baisakh, one who joined in Bhadra.
    for (const [suffix, month] of [
      ["baisakh", 1],
      ["bhadra", 5],
    ] as const) {
      const pupil = await createStudent({
        admissionNo: `__fee-${stamp}-m-${suffix}`,
        firstName: "__fee",
        lastName: `Monthly${suffix}`,
        dob: new Date(Date.UTC(2013, 0, 1)),
        gender: "MALE",
        // `enrolledOn` is taken from `admittedOn`, so this decides the first
        // month the pupil can be charged for.
        admittedOn: bsToAd({ year: MBS, month, day: 1 }),
        guardians: [{ relation: "FATHER", fullName: "__fee Dad", phone: "9800000025" }],
        enrollment: { sectionId: m.sectionId, academicYearId: m.yearId },
      });
      m.studentIds.push(pupil.id);
    }

    m.headId = (await createFeeHead(`__fee Monthly ${stamp}`, "MONTHLY")).id;
    m.structureId = (
      await createFeeStructure({
        academicYearId: m.yearId,
        gradeId: m.gradeId,
        name: `__fee Monthly plan ${stamp}`,
        lines: [{ feeHeadId: m.headId, amount: 400 }],
      })
    ).id;
  });

  afterAll(async () => {
    const ids = (
      await prisma.invoice.findMany({ where: { academicYearId: m.yearId }, select: { id: true } })
    ).map((i) => i.id);
    await prisma.paymentAllocation.deleteMany({ where: { invoiceLine: { invoiceId: { in: ids } } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
    await prisma.feeStructureLine.deleteMany({ where: { feeStructureId: m.structureId } });
    await prisma.feeStructure.deleteMany({ where: { id: m.structureId } });
    await prisma.feeHead.deleteMany({ where: { id: m.headId } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: m.studentIds } } });
    await prisma.guardian.deleteMany({ where: { studentId: { in: m.studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: m.studentIds } } });
    await prisma.section.deleteMany({ where: { id: m.sectionId } });
    await prisma.grade.deleteMany({ where: { id: m.gradeId } });
    await prisma.academicYear.deleteMany({ where: { id: m.yearId } });
  });

  const bill = (month: number) =>
    issueStructure(m.structureId, { month, issuedOn: inBhadra, dueOn: null, now: inBhadra });

  const instalments = (month?: number) =>
    prisma.invoice.findMany({
      where: {
        feeStructureId: m.structureId,
        ...(month === undefined ? {} : { periodMonth: month }),
      },
      include: { enrollment: { include: { student: true } } },
    });

  it("bills a month only for pupils already enrolled in it", async () => {
    // Shrawan, month 4. Only the Baisakh pupil was here; the Bhadra joiner
    // owes nothing for a month before they arrived.
    expect(await bill(4)).toBe(1);

    const shrawan = await instalments(4);
    expect(shrawan).toHaveLength(1);
    expect(shrawan[0].enrollment.student.admissionNo).toBe(`__fee-${stamp}-m-baisakh`);
  });

  it("bills the joiner once their own month comes round", async () => {
    expect(await bill(5)).toBe(2);

    const bhadra = await instalments(5);
    expect(bhadra).toHaveLength(2);
    expect(bhadra.every((i) => i.periodMonth === 5)).toBe(true);

    // The row a picker renders has to say which month, or twelve identical
    // "Monthly Fee, Rs. 400 due" rows are indistinguishable.
    const data = await feeWorkspace(m.yearId, inBhadra);
    const rows = data.invoices.filter((i) => i.feeTypes.length > 0);
    expect(rows.every((i) => i.periodMonth >= 1 && i.periodMonth <= 12)).toBe(true);
    expect(rows.some((i) => i.periodMonth === 4)).toBe(true);
    expect(rows.some((i) => i.periodMonth === 5)).toBe(true);
  });

  it("refuses to bill a month that has not started", async () => {
    await expect(bill(12)).rejects.toBeInstanceOf(FeeError);
    expect(await instalments(12)).toHaveLength(0);
  });

  it("issues each month once, however often it is asked", async () => {
    const before = (await instalments()).length;
    expect(await bill(5)).toBe(0);
    expect((await instalments()).length).toBe(before);
  });

  it("reports each month's billing state for the plan strip", async () => {
    // Months 4 and 5 were billed by the tests above; nothing else has been.
    const data = await feeWorkspace(m.yearId, inBhadra);
    const plan = data.structures.find((p) => p.id === m.structureId);

    expect(plan?.monthly).toBe(true);
    expect(plan?.months).toHaveLength(12);

    const at = (month: number) => plan?.months.find((x) => x.month === month);
    expect(at(4)).toMatchObject({ issued: 1, started: true });
    expect(at(5)).toMatchObject({ issued: 2, started: true });
    // Baisakh through Asar are in the past and were never billed.
    expect(at(1)).toMatchObject({ issued: 0, started: true });
    // Ashwin onward has not arrived, so it is not a missed month.
    expect(at(6)).toMatchObject({ issued: 0, started: false });
    expect(at(12)).toMatchObject({ issued: 0, started: false });

    // What the Overview nudge counts: started, billable, still unbilled.
    expect(data.totals.unbilledMonths).toBe(3);
  });

  it("takes how often a fee is charged from the fee type, not the class", async () => {
    // Otherwise Admission could be one-time for one class and monthly for
    // another, which is not a thing a school charges.
    const head = await prisma.feeHead.findUniqueOrThrow({ where: { id: m.headId } });
    expect(head.frequency).toBe("MONTHLY");

    // A second class on the same fee type inherits it rather than restating
    // it, so the two can never disagree.
    const other = await createGrade({ name: `__fee Class 8b ${stamp}`, order: 9975 });
    const plan = await createFeeStructure({
      academicYearId: m.yearId,
      gradeId: other.id,
      name: `__fee Monthly plan b ${stamp}`,
      lines: [{ feeHeadId: m.headId, amount: 600 }],
    });
    const workspace = await feeWorkspace(m.yearId, inBhadra);
    expect(workspace.structures.find((p) => p.id === plan.id)?.monthly).toBe(true);

    await prisma.feeStructureLine.deleteMany({ where: { feeStructureId: plan.id } });
    await prisma.feeStructure.delete({ where: { id: plan.id } });
    await prisma.grade.delete({ where: { id: other.id } });
  });

  it("counts missed months on their own, for the dashboard nudge", async () => {
    // Same answer as the workspace totals, but without loading every
    // enrolment in the year — Overview only needs the number.
    expect(await unbilledMonthCount(m.yearId, inBhadra)).toBe(3);

    const data = await feeWorkspace(m.yearId, inBhadra);
    expect(await unbilledMonthCount(m.yearId, inBhadra)).toBe(data.totals.unbilledMonths);
  });

  it("leaves one-time charges out of a monthly run", async () => {
    // This plan has no ONE_TIME line, so a month-0 run finds nothing to raise.
    expect(await bill(0)).toBe(0);

    // And the annual plan in the other year is all one-time charges, untouched
    // by any monthly billing.
    const annual = await prisma.invoice.findMany({
      where: { feeStructureId: made.structureIds[0] },
      select: { periodMonth: true },
    });
    expect(annual).toHaveLength(CLASS_SIZE);
    expect(annual.every((i) => i.periodMonth === 0)).toBe(true);
  });
});

/// The matrix writes amounts for a whole year in one go: rows are classes,
/// columns are fee types. It has to fold into whatever plans already exist
/// rather than insisting on its own shape, because live invoices point at
/// those plans.
describe.skipIf(!process.env.DB_TESTS)("the fee matrix", () => {
  const XBS = 2096;
  const x = { yearId: 0, gradeA: 0, gradeB: 0, headOne: 0, headTwo: 0 };

  beforeAll(async () => {
    x.yearId = (await createAcademicYear({ nameBS: String(XBS) })).id;
    x.gradeA = (await createGrade({ name: `__mx Class A ${stamp}`, order: 9981 })).id;
    x.gradeB = (await createGrade({ name: `__mx Class B ${stamp}`, order: 9982 })).id;
    x.headOne = (await createFeeHead(`__mx Admission ${stamp}`)).id;
    x.headTwo = (await createFeeHead(`__mx Library ${stamp}`, "MONTHLY")).id;
  });

  afterAll(async () => {
    const plans = await prisma.feeStructure.findMany({
      where: { academicYearId: x.yearId },
      select: { id: true },
    });
    const ids = plans.map((p) => p.id);
    await prisma.feeStructureLine.deleteMany({ where: { feeStructureId: { in: ids } } });
    await prisma.feeStructure.deleteMany({ where: { id: { in: ids } } });
    await prisma.feeHead.deleteMany({ where: { id: { in: [x.headOne, x.headTwo] } } });
    await prisma.grade.deleteMany({ where: { id: { in: [x.gradeA, x.gradeB] } } });
    await prisma.academicYear.deleteMany({ where: { id: x.yearId } });
  });

  const amounts = async (gradeId: number) => {
    const lines = await prisma.feeStructureLine.findMany({
      where: { feeStructure: { academicYearId: x.yearId, gradeId } },
      select: { feeHeadId: true, amount: true },
      orderBy: { feeHeadId: "asc" },
    });
    return lines;
  };

  it("creates a plan for a class that had none", async () => {
    await setFeeAmounts(x.yearId, [
      { gradeId: x.gradeA, feeHeadId: x.headOne, amount: 5000 },
      { gradeId: x.gradeA, feeHeadId: x.headTwo, amount: 300 },
    ]);

    expect(await amounts(x.gradeA)).toEqual([
      { feeHeadId: x.headOne, amount: 5000 },
      { feeHeadId: x.headTwo, amount: 300 },
    ]);
    // One plan holding both lines, not one plan per fee type.
    expect(await prisma.feeStructure.count({ where: { academicYearId: x.yearId, gradeId: x.gradeA } })).toBe(1);
  });

  it("edits an amount in place rather than making a second plan", async () => {
    const before = await prisma.feeStructure.findFirstOrThrow({
      where: { academicYearId: x.yearId, gradeId: x.gradeA },
    });
    await setFeeAmounts(x.yearId, [{ gradeId: x.gradeA, feeHeadId: x.headOne, amount: 5500 }]);

    expect(await amounts(x.gradeA)).toContainEqual({ feeHeadId: x.headOne, amount: 5500 });
    const after = await prisma.feeStructure.findFirstOrThrow({
      where: { academicYearId: x.yearId, gradeId: x.gradeA },
    });
    expect(after.id).toBe(before.id);
  });

  it("clears a cell by removing just that line", async () => {
    await setFeeAmounts(x.yearId, [{ gradeId: x.gradeA, feeHeadId: x.headTwo, amount: null }]);

    const left = await amounts(x.gradeA);
    expect(left).toEqual([{ feeHeadId: x.headOne, amount: 5500 }]);
  });

  it("leaves classes the matrix did not mention alone", async () => {
    expect(await amounts(x.gradeB)).toEqual([]);
    expect(await prisma.feeStructure.count({ where: { academicYearId: x.yearId, gradeId: x.gradeB } })).toBe(0);
  });

  it("does not leave an empty plan behind when the last cell is cleared", async () => {
    await setFeeAmounts(x.yearId, [{ gradeId: x.gradeB, feeHeadId: x.headOne, amount: 900 }]);
    expect(await prisma.feeStructure.count({ where: { academicYearId: x.yearId, gradeId: x.gradeB } })).toBe(1);

    await setFeeAmounts(x.yearId, [{ gradeId: x.gradeB, feeHeadId: x.headOne, amount: null }]);
    // A plan with no lines cannot be billed and only clutters Send bills.
    expect(await prisma.feeStructure.count({ where: { academicYearId: x.yearId, gradeId: x.gradeB } })).toBe(0);
  });

  it("keeps an emptied plan that has already billed somebody", async () => {
    // Invoices point at the plan. Removing it would orphan real debt, so an
    // emptied plan that has been issued stays.
    const plan = await createFeeStructure({
      academicYearId: x.yearId,
      gradeId: x.gradeB,
      name: `__mx issued ${stamp}`,
      lines: [{ feeHeadId: x.headOne, amount: 700 }],
    });
    const enrollmentless = await prisma.invoice.create({
      data: {
        enrollmentId: (await prisma.enrollment.findFirstOrThrow()).id,
        academicYearId: x.yearId,
        feeStructureId: plan.id,
        number: `__mx-${stamp}`,
        issuedOn: new Date(),
      },
    });

    await setFeeAmounts(x.yearId, [{ gradeId: x.gradeB, feeHeadId: x.headOne, amount: null }]);
    expect(await prisma.feeStructure.count({ where: { id: plan.id } })).toBe(1);

    await prisma.invoice.delete({ where: { id: enrollmentless.id } });
    await prisma.feeStructure.delete({ where: { id: plan.id } });
  });

  it("refuses an amount that is not whole rupees", async () => {
    await expect(
      setFeeAmounts(x.yearId, [{ gradeId: x.gradeB, feeHeadId: x.headOne, amount: 12.5 }]),
    ).rejects.toBeInstanceOf(FeeError);
    expect(await amounts(x.gradeB)).toEqual([]);
  });
});

describe.skipIf(!process.env.DB_TESTS)("collecting payment", () => {
  async function firstInvoice() {
    const invoice = await prisma.invoice.findFirst({
      where: { feeStructureId: made.structureIds[0] },
      orderBy: { id: "asc" },
    });
    return invoice!;
  }

  it("rejects an amount above what is owed", async () => {
    const invoice = await firstInvoice();
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: 1001, method: "CASH" }),
    ).rejects.toBeInstanceOf(FeeError);
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: 0, method: "CASH" }),
    ).rejects.toBeInstanceOf(FeeError);
  });

  it("moves an invoice through PARTIAL to PAID and stops there", async () => {
    const invoice = await firstInvoice();

    const first = await recordPayment({ invoiceId: invoice.id, amount: 400, method: "CASH" });
    expect(first.receiptNo).toMatch(/^RCT-\d+-\d{5}$/);
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))!.status).toBe("PARTIAL");

    await recordPayment({
      invoiceId: invoice.id,
      amount: 600,
      method: "BANK_TRANSFER",
      reference: "  chq 42  ",
    });
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))!.status).toBe("PAID");

    // A trimmed reference is stored, and nothing more can be taken.
    const payments = await prisma.payment.findMany({
      where: { allocations: { some: { invoiceLine: { invoiceId: invoice.id } } } },
    });
    expect(payments.find((p) => p.method === "BANK_TRANSFER")?.reference).toBe("chq 42");
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: 1, method: "CASH" }),
    ).rejects.toBeInstanceOf(FeeError);
  });
});

/// Its own year: these tests take payments, and `feeWorkspace` totals a whole
/// year, so money moved here would show up in the workspace assertions — and
/// only once these had run, making those depend on execution order.
describe.skipIf(!process.env.DB_TESTS)("notes and who paid", () => {
  const NBS = 2097;
  const n = { yearId: 0, gradeId: 0, sectionId: 0, headId: 0, structureId: 0, studentId: 0, enrollmentId: 0, guardianId: 0 };

  beforeAll(async () => {
    n.yearId = (await createAcademicYear({ nameBS: String(NBS) })).id;
    n.gradeId = (await createGrade({ name: `__nt Class ${stamp}`, order: 9991 })).id;
    n.sectionId = (
      await createSection({ name: "A", gradeId: n.gradeId, academicYearId: n.yearId })
    ).id;
    const pupil = await createStudent({
      admissionNo: `__nt-${stamp}`,
      firstName: "__nt",
      lastName: "Pupil",
      dob: new Date(Date.UTC(2013, 0, 1)),
      gender: "FEMALE",
      admittedOn: bsToAd({ year: NBS, month: 1, day: 1 }),
      guardians: [{ relation: "FATHER", fullName: "__nt Ram Thapa", phone: "9800000077" }],
      enrollment: { sectionId: n.sectionId, academicYearId: n.yearId },
    });
    n.studentId = pupil.id;
    n.enrollmentId = (
      await prisma.enrollment.findFirstOrThrow({ where: { studentId: pupil.id } })
    ).id;
    n.guardianId = (
      await prisma.guardian.findFirstOrThrow({ where: { studentId: pupil.id } })
    ).id;

    n.headId = (await createFeeHead(`__nt Tuition ${stamp}`)).id;
    n.structureId = (
      await createFeeStructure({
        academicYearId: n.yearId,
        gradeId: n.gradeId,
        name: `__nt plan ${stamp}`,
        lines: [{ feeHeadId: n.headId, amount: 2000 }],
      })
    ).id;
    await issueStructure(n.structureId, { issuedOn: new Date(), dueOn: null });
  });

  afterAll(async () => {
    const ids = (
      await prisma.invoice.findMany({ where: { academicYearId: n.yearId }, select: { id: true } })
    ).map((i) => i.id);
    await prisma.paymentAllocation.deleteMany({ where: { invoiceLine: { invoiceId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { academicYearId: n.yearId } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
    await prisma.feeNote.deleteMany({ where: { enrollmentId: n.enrollmentId } });
    await prisma.feeStructureLine.deleteMany({ where: { feeStructureId: n.structureId } });
    await prisma.feeStructure.deleteMany({ where: { id: n.structureId } });
    await prisma.feeHead.deleteMany({ where: { id: n.headId } });
    await prisma.enrollment.deleteMany({ where: { studentId: n.studentId } });
    await prisma.guardian.deleteMany({ where: { studentId: n.studentId } });
    await prisma.student.deleteMany({ where: { id: n.studentId } });
    await prisma.section.deleteMany({ where: { id: n.sectionId } });
    await prisma.grade.deleteMany({ where: { id: n.gradeId } });
    await prisma.academicYear.deleteMany({ where: { id: n.yearId } });
  });

  const noteOnRow = async () => {
    const data = await feeWorkspace(n.yearId);
    return data.balances.find((b) => b.enrollmentId === n.enrollmentId)?.note;
  };

  it("keeps one running note per pupil, writable before they pay anything", async () => {
    await setFeeNote(n.enrollmentId, "Family asked to pay in two parts.");
    expect(await noteOnRow()).toBe("Family asked to pay in two parts.");
  });

  it("replaces the note rather than stacking a second one", async () => {
    await setFeeNote(n.enrollmentId, "Reviewed Bhadra 20, paying next week.");
    expect(await prisma.feeNote.count({ where: { enrollmentId: n.enrollmentId } })).toBe(1);
    expect(await noteOnRow()).toBe("Reviewed Bhadra 20, paying next week.");
  });

  it("clears the note when it is emptied", async () => {
    await setFeeNote(n.enrollmentId, "   ");
    expect(await prisma.feeNote.count({ where: { enrollmentId: n.enrollmentId } })).toBe(0);
    expect(await noteOnRow()).toBeNull();
  });

  it("builds a printable invoice with everything a parent must see", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const doc = await invoiceDocument(invoice.number);

    expect(doc.number).toBe(invoice.number);
    expect(doc.student.name).toContain("__nt");
    expect(doc.student.section).toContain("__nt Class");
    expect(doc.lines).toEqual([
      expect.objectContaining({ feeType: `__nt Tuition ${stamp}`, amount: 2000 }),
    ]);
    expect(doc.total).toBe(2000);
    // What is still owed belongs on the bill: a parent holding it needs to
    // know whether it is settled, not just what it once cost.
    expect(doc.paid).toBe(0);
    expect(doc.due).toBe(2000);
  });

  it("builds a receipt naming the payer and what it settled", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const payment = await recordPayment({
      invoiceId: invoice.id,
      amount: 250,
      method: "CASH",
      paidByName: "Aunt Sita",
      paidByPhone: "9800000055",
    });

    const doc = await receiptDocument(payment.receiptNo);
    expect(doc.receiptNo).toBe(payment.receiptNo);
    expect(doc.amount).toBe(250);
    expect(doc.paidBy).toMatchObject({ name: "Aunt Sita", phone: "9800000055" });
    expect(doc.student.name).toContain("__nt");
    // Which charge the money went against, so a receipt can be matched to a
    // bill months later.
    // Each line carries its own month, because one payment can settle several
    // months at once and "Monthly Fee" alone would name none of them.
    expect(doc.settled).toEqual([
      expect.objectContaining({ feeType: `__nt Tuition ${stamp}`, amount: 250, periodMonth: 0 }),
    ]);
    expect(doc.invoiceNumber).toBe(invoice.number);
  });

  it("combines a pupil's receipts into one statement", async () => {
    // Takes its own payments rather than relying on what neighbouring tests
    // happen to have left behind.
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const first = await recordPayment({ invoiceId: invoice.id, amount: 60, method: "CASH" });
    const second = await recordPayment({
      invoiceId: invoice.id,
      amount: 40,
      method: "BANK_TRANSFER",
    });
    const receipts = [
      { receiptNo: first.receiptNo, amount: 60 },
      { receiptNo: second.receiptNo, amount: 40 },
    ];

    // Deliberately handed in the wrong order: the document sorts them.
    const doc = await statementDocument([second.receiptNo, first.receiptNo]);

    expect(doc.student.name).toContain("__nt");
    expect(doc.rows).toHaveLength(receipts.length);
    // Oldest first: a statement is read as a history, not as a newest-first
    // feed.
    expect(doc.rows.map((r) => r.receiptNo)).toEqual(receipts.map((r) => r.receiptNo));
    expect(doc.total).toBe(receipts.reduce((sum, r) => sum + r.amount, 0));
    expect(doc.rows.every((r) => r.paidTowards.length > 0)).toBe(true);
  });

  it("refuses to mix two pupils on one statement", async () => {
    const mine = await prisma.payment.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const other = await prisma.payment.findFirst({
      where: { academicYearId: { not: n.yearId }, status: "COMPLETED" },
    });
    if (!other) return; // nothing else in the database to mix with

    // A statement carries one pupil's name and one signature line. Two
    // children on one sheet is not a document anybody can use.
    await expect(
      statementDocument([mine.receiptNo, other.receiptNo]),
    ).rejects.toBeInstanceOf(FeeError);
  });

  it("refuses an empty statement", async () => {
    await expect(statementDocument([])).rejects.toBeInstanceOf(FeeError);
  });

  it("refuses a document for a number that does not exist", async () => {
    await expect(invoiceDocument("INV-nope")).rejects.toBeInstanceOf(FeeError);
    await expect(receiptDocument("RCT-nope")).rejects.toBeInstanceOf(FeeError);
  });

  it("offers the pupil's guardians to the collection form", async () => {
    const data = await feeWorkspace(n.yearId);

    // Only for pupils who actually owe something: the picker never offers a
    // payer for a bill nobody can pay.
    const guardians = data.guardians[n.enrollmentId];
    expect(guardians).toBeDefined();
    expect(guardians.map((g) => g.fullName)).toContain("__nt Ram Thapa");
    expect(guardians[0]).toMatchObject({ relation: "FATHER", phone: "9800000077" });
  });

  it("records who handed the money over, as a snapshot", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const guardian = await prisma.guardian.findUniqueOrThrow({ where: { id: n.guardianId } });

    const payment = await recordPayment({
      invoiceId: invoice.id,
      amount: 500,
      method: "CASH",
      paidByGuardianId: guardian.id,
      paidByName: guardian.fullName,
      paidByPhone: guardian.phone,
    });

    const saved = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(saved.paidByGuardianId).toBe(guardian.id);
    // Snapshotted, not read through the link: a receipt must keep saying what
    // it said the day it was printed, even if the guardian's phone changes.
    expect(saved.paidByName).toBe(guardian.fullName);
    expect(saved.paidByPhone).toBe(guardian.phone);
  });

  it("takes a payer who is not a guardian at all", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const payment = await recordPayment({
      invoiceId: invoice.id,
      amount: 300,
      method: "CASH",
      paidByName: "Uncle Bikash",
      paidByPhone: "9800000099",
    });

    const saved = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(saved.paidByGuardianId).toBeNull();
    expect(saved.paidByName).toBe("Uncle Bikash");
  });

  it("breaks a pupil's fees down by type, with what is still owed", async () => {
    const pane = await pupilFees(n.enrollmentId);

    expect(pane.student.name).toContain("__nt");

    // Asserted as relationships rather than fixed figures: the tests around
    // this one take payments, so a hardcoded total would only be right for one
    // execution order. What must hold is that the parts agree.
    const taken = pane.payments.reduce((sum, p) => sum + p.amount, 0);
    expect(taken).toBeGreaterThan(0);
    expect(pane.summary).toMatchObject({
      charged: 2000,
      paid: taken,
      owed: 2000 - taken,
      status: "part",
    });

    expect(pane.byFeeType).toHaveLength(1);
    expect(pane.byFeeType[0]).toMatchObject({
      name: `__nt Tuition ${stamp}`,
      charged: pane.summary.charged,
      paid: pane.summary.paid,
      owed: pane.summary.owed,
      status: "part",
    });

    // Newest first: the last receipt is the one being asked about.
    expect(pane.payments[0].id).toBe(Math.max(...pane.payments.map((p) => p.id)));
    expect(pane.payments.map((x) => x.paidByName)).toContain("Uncle Bikash");
    expect(pane.payments.every((x) => x.receiptNo.length > 0)).toBe(true);
  });

  it("lists the pupil's own bills, now that the page has no invoice list", async () => {
    const pane = await pupilFees(n.enrollmentId);

    expect(pane.bills.length).toBeGreaterThan(0);
    // The parts of the pane agree: the bills add up to the summary above them.
    expect(pane.bills.reduce((sum, b) => sum + b.charged, 0)).toBe(pane.summary.charged);
    expect(pane.bills.reduce((sum, b) => sum + b.paid, 0)).toBe(pane.summary.paid);

    const bill = pane.bills[0];
    // The number is how a bill is printed and how a parent quotes it back, so
    // the pane cannot be the only list of bills without carrying it.
    expect(bill.number.length).toBeGreaterThan(0);
    expect(bill.owed).toBe(bill.charged - bill.paid);
    expect(bill.feeTypes).toContain(`__nt Tuition ${stamp}`);
    expect(bill.status).toBe(bill.paid === 0 ? "unpaid" : bill.owed > 0 ? "part" : "paid");

    // Nothing owed cannot be late, whatever the due date says.
    expect(pane.bills.every((b) => !b.overdue || b.owed > 0)).toBe(true);
    // Newest first, following the order the invoices are read in.
    expect(pane.bills[0].id).toBe(Math.max(...pane.bills.map((b) => b.id)));
  });

  it("shows the note and nothing monthly for a one-time-only pupil", async () => {
    await setFeeNote(n.enrollmentId, "Paying in parts.");
    const pane = await pupilFees(n.enrollmentId);

    expect(pane.note).toBe("Paying in parts.");
    // No monthly fee type, so no strip to draw.
    expect(pane.months).toEqual([]);
    await setFeeNote(n.enrollmentId, "");
  });

  it("leaves the payer blank when nobody was named", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { academicYearId: n.yearId } });
    const payment = await recordPayment({ invoiceId: invoice.id, amount: 100, method: "CASH" });
    const saved = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(saved.paidByName).toBeNull();
    expect(saved.paidByPhone).toBeNull();
    expect(saved.paidByGuardianId).toBeNull();
  });
});

describe.skipIf(!process.env.DB_TESTS)("the workspace view", () => {
  it("totals the ledger and offers every unpaid invoice for collection", async () => {
    const data = await feeWorkspace(made.yearId);

    // One row per billable pupil: every billed student plus the active one
    // nobody has charged yet. The departed student is neither.
    expect(data.balances).toHaveLength(CLASS_SIZE + 1);
    // Settled means charged and paid off. A pupil charged nothing has not
    // settled anything, so the empty row must not count as one.
    const settled = data.balances.filter((b) => b.hasBill && b.billed === b.paid);
    expect(settled).toHaveLength(1);
    expect(data.totals.billed).toBe(CLASS_SIZE * 1000);
    expect(data.totals.collected).toBe(1000);
    expect(data.totals.outstanding).toBe((CLASS_SIZE - 1) * 1000);

    // Every invoice that still owes money must be collectable, not just the
    // most recent page of them.
    expect(data.openInvoices).toHaveLength(CLASS_SIZE - 1);
    expect(data.openInvoices.every((i) => i.due > 0)).toBe(true);

    const structure = data.structures.find((s) => s.id === made.structureIds[0]);
    expect(structure?.total).toBe(1000);
    expect(structure?.issued).toBe(CLASS_SIZE);
  });

  it("lists an unbilled pupil without letting them move the totals", async () => {
    const data = await feeWorkspace(made.yearId);

    const row = data.balances.find((b) => b.admissionNo === `__fee-${stamp}-unbilled`);
    expect(row).toBeDefined();
    expect(row?.hasBill).toBe(false);
    expect(row?.billed).toBe(0);
    expect(row?.paid).toBe(0);
    expect(row?.due).toBe(0);

    // Money the school never asked for is not arrears, and an empty row is
    // not a settled one.
    expect(data.totals.billed).toBe(CLASS_SIZE * 1000);
    expect(data.totals.collected).toBe(1000);
    expect(data.totals.arrears).toBe(CLASS_SIZE - 1);
    expect(data.totals.unbilled).toBe(1);

    // Every billed pupil is still marked as carrying a bill.
    expect(data.balances.filter((b) => b.hasBill)).toHaveLength(CLASS_SIZE);

    // A pupil who has left cannot be billed, so offering them a row would
    // offer an action that silently does nothing.
    const departed = data.balances.find((b) => b.admissionNo === `__fee-${stamp}-left`);
    expect(departed).toBeUndefined();
  });

  it("names what each bill is for", async () => {
    const data = await feeWorkspace(made.yearId);
    const tuition = `__fee Tuition ${stamp}`;
    const exam = `__fee Exam ${stamp}`;

    // An invoice number tells nobody what was charged. The fee types do.
    const invoice = data.invoices.find((i) => i.total === 1000);
    expect(invoice?.feeTypes).toEqual([exam, tuition]);

    // A pupil's row names every type they have been charged, once each, even
    // though two invoice lines carry them.
    const billed = data.balances.find((b) => b.hasBill);
    expect(billed?.feeTypes).toEqual([exam, tuition]);

    // Nobody has charged them anything, so there is nothing to name.
    const unbilled = data.balances.find((b) => !b.hasBill);
    expect(unbilled?.feeTypes).toEqual([]);
  });

  it("prices the overdue queue rather than only counting it", async () => {
    const data = await feeWorkspace(made.yearId);

    const late = data.invoices.filter((i) => i.overdue);
    expect(data.totals.overdue).toBe(late.length);
    // Five late bills at Rs. 200 and five at Rs. 20,000 are not the same
    // morning's work, so the header chip carries what they are worth.
    expect(data.totals.overdueAmount).toBe(late.reduce((sum, i) => sum + i.due, 0));
    // A bill that owes nothing can never add to it.
    expect(data.totals.overdueAmount).toBeLessThanOrEqual(data.totals.outstanding);
  });

  it("splits a balance row by fee type, so the strip can narrow the money", async () => {
    const data = await feeWorkspace(made.yearId);
    const tuition = `__fee Tuition ${stamp}`;
    const exam = `__fee Exam ${stamp}`;

    const billed = data.balances.find((b) => b.hasBill && b.paid > 0) ?? data.balances.find((b) => b.hasBill)!;
    expect(billed.byType.map((t) => t.name)).toEqual([exam, tuition]);

    // The parts are the whole: a fee type's figures are a slice of the row's,
    // never a second opinion about it.
    expect(billed.byType.reduce((sum, t) => sum + t.billed, 0)).toBe(billed.billed);
    expect(billed.byType.reduce((sum, t) => sum + t.paid, 0)).toBe(billed.paid);
    expect(billed.byType.every((t) => t.due === t.billed - t.paid)).toBe(true);

    // And each type is genuinely a part, not the total repeated: "owes
    // Rs. 16,500" must not be what the Admission column reports.
    expect(billed.byType.every((t) => t.billed > 0 && t.billed < billed.billed)).toBe(true);

    // Nobody has charged the unbilled pupil anything, so there is nothing to
    // split.
    expect(data.balances.find((b) => !b.hasBill)?.byType).toEqual([]);
  });

  it("tags each balance row with the class that filters it", async () => {
    const data = await feeWorkspace(made.yearId);

    const row = data.balances.find((b) => b.admissionNo === `__fee-${stamp}-unbilled`);
    expect(row?.gradeId).toBe(made.unbilledGradeId);
    expect(row?.sectionId).toBe(made.unbilledSectionId);
    expect(data.balances.every((b) => b.gradeId > 0 && b.sectionId > 0)).toBe(true);
  });
});
