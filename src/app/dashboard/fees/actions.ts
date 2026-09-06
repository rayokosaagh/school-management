"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, currentActor, requireCapability } from "@/lib/auth/guard";
import { parseBsInput } from "@/lib/date/bs";
import { numericField } from "@/lib/form";
import {
  FeeError,
  createFeeHead,
  deleteFeeHead,
  setFeeAmounts,
  setFeeNote,
  type FeeAmount,
  createFeeStructure,
  issueMonth,
  issueStructure,
  recordPayment,
  setFeeHeadActive,
  type StructureLineInput,
} from "@/lib/fees/fees";

/// `token` carries the id of the row just written, so two identical successes
/// — "Payment recorded." twice in a row at the counter — are two toasts, not
/// one swallowed by the de-duplicator.
export type FeeActionState = { error?: string; success?: string; token?: number };

const PATH = "/dashboard/fees";

/// Money is the one place in the app where a silent failure is unacceptable, so
/// every action funnels its errors through here rather than throwing past the
/// form and leaving the clerk staring at an unchanged screen.
function failure(error: unknown, fallback: string): FeeActionState {
  if (error instanceof ForbiddenError || error instanceof FeeError) return { error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { error: "A record with those details already exists." };
    if (error.code === "P2003" || error.code === "P2025") {
      return { error: "Something that was chosen no longer exists — reload the page." };
    }
  }
  return { error: fallback };
}

export async function addFeeHead(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    await requireCapability("manage:fees");
    // Monthly is the only alternative the school actually bills on; termly
    // and annual exist in the enum but nothing reads them yet.
    const monthly = String(data.get("frequency") ?? "") === "MONTHLY";
    const scope = String(data.get("billingScope") ?? "CLASS");
    if (scope !== "CLASS" && scope !== "STUDENT") throw new FeeError("Choose class-wide or per-student billing.");
    const head = await createFeeHead(String(data.get("name") ?? ""), monthly ? "MONTHLY" : "ONE_TIME", scope);
    revalidatePath(PATH);
    return { success: `${head.name} added.`, token: head.id };
  } catch (e) {
    return failure(e, "Could not add that fee type.");
  }
}

/// Saves the whole fee matrix in one submit.
///
/// Fields arrive as `amount-<gradeId>-<feeHeadId>`. A blank cell means the
/// class is not charged that fee, which is a removal rather than a zero.
export async function saveFeeMatrix(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const academicYearId = numericField(data, "academicYearId");
  if (!academicYearId) return { error: "No academic year selected." };

  const entries: FeeAmount[] = [];
  for (const [field, raw] of data.entries()) {
    const match = /^amount-(\d+)-(\d+)$/.exec(field);
    if (!match) continue;
    const text = String(raw).trim();
    if (text !== "" && !/^\d+$/.test(text)) {
      return { error: "Amounts must be whole rupees." };
    }
    entries.push({
      gradeId: Number(match[1]),
      feeHeadId: Number(match[2]),
      amount: text === "" ? null : Number(text),
    });
  }
  if (entries.length === 0) return { error: "Nothing to save." };

  try {
    const actor = await requireCapability("manage:fees");
    await setFeeAmounts(academicYearId, entries, actor);
    revalidatePath(PATH);
    const charged = entries.filter((e) => e.amount !== null).length;
    return { success: `Saved. ${charged} fee${charged === 1 ? "" : "s"} set across your classes.`, token: charged };
  } catch (e) {
    return failure(e, "Could not save those amounts.");
  }
}

export async function saveFeeNote(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const enrollmentId = numericField(data, "enrollmentId");
  if (!enrollmentId) return { error: "Choose a student." };

  try {
    await requireCapability("manage:fees");
    const actor = await currentActor();
    const saved = await setFeeNote(enrollmentId, String(data.get("body") ?? ""), actor?.userId);
    revalidatePath(PATH);
    return { success: saved ? "Note saved." : "Note removed.", token: enrollmentId };
  } catch (e) {
    return failure(e, "Could not save that note.");
  }
}

/// Deletes a fee type that has never been billed for. The guard lives in
/// deleteFeeHead; this only carries the answer back to the sheet.
export async function removeFeeHead(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const id = numericField(data, "headId");
  if (!id) return { error: "Choose a fee type." };
  try {
    const actor = await requireCapability("manage:fees");
    const gone = await deleteFeeHead(id, actor);
    revalidatePath(PATH);
    return { success: `${gone.name} deleted.`, token: gone.id };
  } catch (e) {
    return failure(e, "Could not delete that fee type.");
  }
}

export async function toggleFeeHead(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const id = numericField(data, "headId");
  if (!id) return { error: "Choose a fee type." };
  try {
    await requireCapability("manage:fees");
    const head = await setFeeHeadActive(id, data.get("isActive") === "true");
    revalidatePath(PATH);
    return { success: head.isActive ? `${head.name} is in use again.` : `${head.name} retired.`, token: head.id };
  } catch (e) {
    return failure(e, "Could not change that fee head.");
  }
}

/// The form posts one `feeHeadId`/`amount` pair per line, in order. Rows the
/// user left blank are dropped rather than rejected — an empty spare row is a
/// half-finished thought, not a mistake.
function structureLines(data: FormData): StructureLineInput[] | "invalid" {
  const headIds = data.getAll("feeHeadId");
  const amounts = data.getAll("amount");
  const lines: StructureLineInput[] = [];

  for (let i = 0; i < headIds.length; i++) {
    const headId = String(headIds[i] ?? "").trim();
    const amount = String(amounts[i] ?? "").trim();
    if (headId === "" && amount === "") continue;
    const feeHeadId = Number(headId);
    const value = Number(amount);
    if (!Number.isInteger(feeHeadId) || feeHeadId <= 0) return "invalid";
    if (!Number.isInteger(value) || value <= 0) return "invalid";
    lines.push({ feeHeadId, amount: value });
  }
  return lines;
}

export async function addFeeStructure(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const academicYearId = numericField(data, "academicYearId");
  const gradeId = numericField(data, "gradeId");
  if (!academicYearId || !gradeId) return { error: "Choose a grade for this structure." };

  const lines = structureLines(data);
  if (lines === "invalid") return { error: "Every line needs a fee head and a whole-rupee amount." };
  if (lines.length === 0) return { error: "Add at least one fee line." };

  try {
    await requireCapability("manage:fees");
    const structure = await createFeeStructure({
      academicYearId,
      gradeId,
      name: String(data.get("name") ?? ""),
      lines,
    });
    revalidatePath(PATH);
    return { success: `${structure.name} created.`, token: structure.id };
  } catch (e) {
    return failure(e, "Could not create that structure.");
  }
}

export async function issueInvoices(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const structureId = numericField(data, "structureId");
  if (!structureId) return { error: "Choose a fee plan." };

  // 0 unless a monthly instalment is named, which is what the plan's month
  // buttons post.
  const month = Number(data.get("month") ?? 0);
  if (!Number.isInteger(month) || month < 0 || month > 12) {
    return { error: "Choose a month to bill, or bill the one-time charges." };
  }

  // Optional: an invoice with no due date simply never falls overdue.
  const rawDue = String(data.get("dueOn") ?? "").trim();
  const dueOn = rawDue === "" ? null : parseBsInput(rawDue);
  if (rawDue !== "" && dueOn === null) return { error: "That due date is not a real BS date." };

  try {
    const actor = await requireCapability("manage:fees");
    const issued = await issueStructure(structureId, { month, issuedOn: new Date(), dueOn, actor });
    revalidatePath(PATH);
    return {
      success: issued
        ? `${issued} invoice${issued === 1 ? "" : "s"} issued.`
        : "Everyone in that class has already been billed for this.",
      token: structureId,
    };
  } catch (e) {
    return failure(e, "Could not issue those invoices.");
  }
}

/// Bills every class of the year for one period, in one press.
///
/// A month belongs to the school, not to a class. Issuing it a plan at a time
/// is how Bhadra went out for six classes and was missed for the other two —
/// which is exactly what `issueMonth` exists to prevent, and what nothing in
/// the app was calling it for.
export async function issueEveryClass(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const academicYearId = numericField(data, "academicYearId");
  if (!academicYearId) return { error: "Choose an academic year." };

  // 0 bills the one-time charges — admission and the yearly fees — and 1-12
  // one monthly instalment.
  const month = Number(data.get("month") ?? 0);
  if (!Number.isInteger(month) || month < 0 || month > 12) {
    return { error: "Choose a month to bill, or bill the one-time charges." };
  }

  const rawDue = String(data.get("dueOn") ?? "").trim();
  const dueOn = rawDue === "" ? null : parseBsInput(rawDue);
  if (rawDue !== "" && dueOn === null) return { error: "That due date is not a real BS date." };

  try {
    const actor = await requireCapability("manage:fees");
    const { invoices, classes } = await issueMonth(academicYearId, {
      actor,
      month,
      issuedOn: new Date(),
      dueOn,
    });
    revalidatePath(PATH);
    revalidatePath("/dashboard");
    return {
      success: invoices
        ? `${invoices} invoice${invoices === 1 ? "" : "s"} issued across ${classes} class${classes === 1 ? "" : "es"}.`
        : "Nothing to issue — every class with a plan has already been billed for this period.",
      // Distinct per run, so two identical results in a row are two toasts.
      token: Date.now(),
    };
  } catch (e) {
    return failure(e, "Could not issue those invoices.");
  }
}

export async function takePayment(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  const requestKey = String(data.get("requestKey") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
    return { error: "Reopen the collection form before recording this payment." };
  }
  const invoiceId = numericField(data, "invoiceId");
  if (!invoiceId) return { error: "Choose an invoice." };

  const amount = Number(String(data.get("amount") ?? "").trim());
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: "Enter a whole-rupee amount above zero." };
  }

  try {
    const actor = await requireCapability("manage:fees");
    const payment = await recordPayment({
      requestKey,
      invoiceId,
      amount,
      method: data.get("method") === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH",
      reference: String(data.get("reference") ?? ""),
      receivedById: actor?.userId,
      // Only set when the payer was picked from the pupil's own guardians;
      // a typed-in name has no row to point at.
      paidByGuardianId: numericField(data, "paidByGuardianId") ?? undefined,
      paidByName: String(data.get("paidByName") ?? ""),
      paidByPhone: String(data.get("paidByPhone") ?? ""),
    }, actor);
    revalidatePath(PATH);
    return { success: `Payment recorded — receipt ${payment.receiptNo}.`, token: payment.id };
  } catch (e) {
    return failure(e, "Could not record that payment.");
  }
}
