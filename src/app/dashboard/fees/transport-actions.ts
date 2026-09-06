"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, requireCapability } from "@/lib/auth/guard";
import { FeeError } from "@/lib/fees/fees";
import { issueTransport, saveTransportRegistration, setTransportActive } from "@/lib/fees/transport";
import type { FeeActionState } from "./actions";

function failure(error: unknown): FeeActionState {
  if (error instanceof FeeError || error instanceof ForbiddenError) return { error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { error: "This record was already saved or billed. Refresh to see the latest details." };
  }
  return { error: "Could not save transport changes. Please refresh and try again." };
}

export async function saveTransport(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    const saved = await saveTransportRegistration({
      academicYearId: Number(data.get("academicYearId")),
      enrollmentId: Number(data.get("enrollmentId")),
      pickupLocation: String(data.get("pickupLocation") ?? ""),
      monthlyAmount: Number(data.get("monthlyAmount")),
      startMonth: Number(data.get("startMonth")),
      isActive: data.get("isActive") === "true",
    }, actor);
    revalidatePath("/dashboard/fees");
    return { success: "Transport registration saved. Existing bills are unchanged.", token: saved.id };
  } catch (error) {
    return failure(error);
  }
}

/// Pause or resume transport from the roster, without opening the registration
/// sheet. A pupil off the bus for a term is a common enough change that it
/// should not cost a form.
///
/// Takes one `enrollmentId` or many, so the row button and the bulk bar post
/// the same thing. Sequential rather than concurrent: each registration is its
/// own small transaction, and a dozen of them racing buys nothing a clerk
/// would notice.
export async function toggleTransport(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    const isActive = data.get("isActive") === "true";
    const academicYearId = Number(data.get("academicYearId"));
    const enrollmentIds = data.getAll("enrollmentId").map(Number);
    if (enrollmentIds.length === 0) return { error: "Choose at least one student." };

    for (const enrollmentId of enrollmentIds) {
      await setTransportActive({ academicYearId, enrollmentId, isActive }, actor);
    }
    revalidatePath("/dashboard/fees");
    const many = enrollmentIds.length > 1 ? `${enrollmentIds.length} students` : "This student";
    return {
      success: isActive
        ? `Transport resumed. ${many} ${enrollmentIds.length > 1 ? "are" : "is"} billed again from the next run.`
        : `Transport paused for ${enrollmentIds.length > 1 ? `${enrollmentIds.length} students` : "this student"}. Existing bills are unchanged.`,
      token: Date.now(),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function billTransport(_: FeeActionState, data: FormData): Promise<FeeActionState> {
  try {
    const actor = await requireCapability("manage:fees");
    const count = await issueTransport(Number(data.get("academicYearId")), Number(data.get("month")), new Date(), actor);
    revalidatePath("/dashboard/fees");
    revalidatePath("/dashboard");
    return {
      success: count ? `Issued ${count} transport bill${count === 1 ? "" : "s"}.` : "No new transport bills. Eligible students have already been billed, or no active registrations match this month.",
      token: Date.now(),
    };
  } catch (error) {
    return failure(error);
  }
}
