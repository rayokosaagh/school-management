"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import {
  AssignmentMismatchError,
  setSubjectTeacher,
} from "@/lib/registry/assignments";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/assignments";

/// Every action below is a public HTTP endpoint, so the check lives here
/// rather than in the page that renders the form.
async function requireSession() {
  await requireCapability("manage:registry");
}

export async function assignSubjectTeacher(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const sectionId = Number(formData.get("sectionId"));
  const subjectOfferingId = Number(formData.get("subjectOfferingId"));
  const raw = String(formData.get("staffId") ?? "");

  if (!Number.isInteger(sectionId)) return { error: "Pick a section." };
  if (!Number.isInteger(subjectOfferingId)) return { error: "Pick a subject." };

  // Empty clears the teacher rather than failing.
  const staffId = raw === "" ? null : Number(raw);
  if (staffId !== null && !Number.isInteger(staffId)) {
    return { error: "Pick a teacher." };
  }

  try {
    await setSubjectTeacher(sectionId, subjectOfferingId, staffId);
  } catch (e) {
    if (e instanceof AssignmentMismatchError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/teachers");
  return { success: staffId === null ? "Teacher cleared." : "Teacher assigned." };
}
