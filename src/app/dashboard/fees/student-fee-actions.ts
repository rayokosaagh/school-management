"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, requireCapability } from "@/lib/auth/guard";
import { FeeError } from "@/lib/fees/fees";
import { createStudentFeePlan, saveStudentFeePlan, issueStudentFeePlan, unregisterStudentFeePlan } from "@/lib/fees/student-fees";
import type { FeeActionState } from "./actions";

function failure(error: unknown): FeeActionState {
  if (error instanceof FeeError || error instanceof ForbiddenError) return { error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This fee already has a plan for the selected academic year. Edit the existing plan instead." };
  return { error: "Could not save student fees. Refresh and try again." };
}
function refresh() { revalidatePath("/dashboard/fees"); revalidatePath("/dashboard"); }

export async function addStudentFee(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    const frequency = String(data.get("frequency"));
    if (frequency !== "ONE_TIME" && frequency !== "MONTHLY") throw new FeeError("Choose yearly or monthly billing.");
    await createStudentFeePlan({ academicYearId: Number(data.get("academicYearId")), name: String(data.get("name") ?? ""), amount: Number(data.get("amount")), frequency, convertClassFee: data.get("convertClassFee") === "true" }, actor);
    refresh();
    return { success: "Student fee created. Select its students before issuing bills.", token: Date.now() };
  } catch (error) { return failure(error); }
}

export async function saveStudentFee(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    await saveStudentFeePlan({ academicYearId: Number(data.get("academicYearId")), planId: Number(data.get("planId")), amount: Number(data.get("amount")), isActive: data.get("isActive") === "true", enrollmentIds: data.getAll("enrollmentId").map(Number) }, actor);
    refresh();
    return { success: "Price and student selection saved. Existing bills are unchanged.", token: Date.now() };
  } catch (error) { return failure(error); }
}

export async function billStudentFee(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    const count = await issueStudentFeePlan(Number(data.get("academicYearId")), Number(data.get("planId")), Number(data.get("month")), new Date(), actor);
    refresh();
    return { success: count ? `Issued ${count} student fee bill${count === 1 ? "" : "s"}.` : "No new bills. No eligible students, or the selected students have already been billed for this period.", token: Date.now() };
  } catch (error) { return failure(error); }
}

export async function unregisterStudentFee(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    const { removed, keptBecauseBilled } = await unregisterStudentFeePlan({
      academicYearId: Number(data.get("academicYearId")),
      planId: Number(data.get("planId")),
      enrollmentIds: data.getAll("enrollmentId").map(Number),
    }, actor);
    refresh();
    if (removed === 0) {
      return { error: keptBecauseBilled > 0
        ? "Those students have already been billed for this service, so they cannot be unregistered. Pause them instead."
        : "Nothing to unregister." };
    }
    return {
      success: keptBecauseBilled > 0
        ? `Unregistered ${removed} student${removed === 1 ? "" : "s"}. ${keptBecauseBilled} already billed, so ${keptBecauseBilled === 1 ? "that one was" : "those were"} left in place — pause ${keptBecauseBilled === 1 ? "it" : "them"} instead.`
        : `Unregistered ${removed} student${removed === 1 ? "" : "s"}.`,
      token: Date.now(),
    };
  } catch (error) { return failure(error); }
}
