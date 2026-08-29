"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { numericField } from "@/lib/form";
import {
  UnknownYearError,
  setCurrentAcademicYear,
} from "@/lib/registry/academic-year";

export type YearState = { error?: string; success?: string };

export async function switchAcademicYear(
  _prev: YearState,
  formData: FormData,
): Promise<YearState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You are not signed in." };

  const id = numericField(formData, "academicYearId");
  if (id === null) return { error: "Pick a year." };

  try {
    await setCurrentAcademicYear(id);
  } catch (e) {
    if (e instanceof UnknownYearError) return { error: e.message };
    throw e;
  }

  // Every page under the dashboard reads the current year, so the whole segment
  // has to be rebuilt rather than just the page that happened to be open.
  revalidatePath("/dashboard", "layout");
  return { success: "Academic year switched." };
}
