"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { Prisma } from "@/generated/prisma/client";
import { numericField } from "@/lib/form";
import {
  createOffering,
  createSubject,
  deleteOffering,
  deleteSubject,
  updateOffering,
  updateSubject,
} from "@/lib/registry/subjects";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/subjects";

/// Every action below is a public HTTP endpoint, so the check lives here
/// rather than in the page that renders the form.
async function requireSession() {
  await requireCapability("manage:registry");
}

function isDuplicate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function addSubject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter the subject name." };

  try {
    await createSubject({ name });
  } catch (e) {
    // Name is the only unique field now, so this is the one clash left.
    if (isDuplicate(e)) return { error: `${name} is already a subject.` };
    throw e;
  }

  revalidatePath(PATH);
  return { success: `${name} added.` };
}

export async function removeSubject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "subjectId");
  if (id === null) return { error: "Pick a subject." };

  try {
    await deleteSubject(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Subject removed." };
}

export async function addOffering(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const subjectId = Number(formData.get("subjectId"));
  const gradeId = Number(formData.get("gradeId"));
  const academicYearId = Number(formData.get("academicYearId"));
  const hasPractical = formData.get("hasPractical") === "on";

  const fullMarksTheory = Number(formData.get("fullMarksTheory"));
  const passMarksTheory = Number(formData.get("passMarksTheory"));
  const fullMarksPractical = Number(formData.get("fullMarksPractical"));
  const passMarksPractical = Number(formData.get("passMarksPractical"));

  if (!Number.isInteger(subjectId)) return { error: "Pick a subject." };
  if (!Number.isInteger(gradeId)) return { error: "Pick a grade." };
  if (!Number.isInteger(academicYearId)) {
    return { error: "Set a current academic year first." };
  }

  if (!Number.isInteger(fullMarksTheory) || fullMarksTheory < 1) {
    return { error: "Theory full marks must be a whole number above zero." };
  }
  if (!Number.isInteger(passMarksTheory) || passMarksTheory < 1) {
    return { error: "Theory pass marks must be a whole number above zero." };
  }
  if (passMarksTheory > fullMarksTheory) {
    return { error: "Theory pass marks cannot exceed full marks." };
  }

  if (hasPractical) {
    if (!Number.isInteger(fullMarksPractical) || fullMarksPractical < 1) {
      return { error: "Practical full marks must be a whole number above zero." };
    }
    if (!Number.isInteger(passMarksPractical) || passMarksPractical < 1) {
      return { error: "Practical pass marks must be a whole number above zero." };
    }
    if (passMarksPractical > fullMarksPractical) {
      return { error: "Practical pass marks cannot exceed full marks." };
    }
  }

  try {
    await createOffering({
      subjectId,
      gradeId,
      academicYearId,
      hasPractical,
      fullMarksTheory,
      passMarksTheory,
      fullMarksPractical,
      passMarksPractical,
    });
  } catch (e) {
    if (isDuplicate(e)) {
      return { error: "That subject is already offered to that grade this year." };
    }
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Offering added." };
}

export async function removeOffering(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "offeringId");
  if (id === null) return { error: "Pick an offering." };

  try {
    await deleteOffering(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Offering removed." };
}

export async function editSubject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "subjectId");
  const name = String(formData.get("name") ?? "").trim();

  if (id === null) return { error: "Pick a subject." };
  if (name.length < 2) return { error: "Enter the subject name." };

  try {
    await updateSubject(id, { name });
  } catch (e) {
    if (isDuplicate(e)) return { error: `${name} is already a subject.` };
    throw e;
  }

  revalidatePath(PATH);
  return { success: `${name} saved.` };
}

export async function editOffering(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = Number(formData.get("offeringId"));
  const hasPractical = formData.get("hasPractical") === "on";
  const fullMarksTheory = Number(formData.get("fullMarksTheory"));
  const passMarksTheory = Number(formData.get("passMarksTheory"));
  const fullMarksPractical = Number(formData.get("fullMarksPractical"));
  const passMarksPractical = Number(formData.get("passMarksPractical"));

  if (!Number.isInteger(id)) return { error: "Pick an offering." };
  if (!Number.isInteger(fullMarksTheory) || fullMarksTheory < 1) {
    return { error: "Theory full marks must be a whole number above zero." };
  }
  if (!Number.isInteger(passMarksTheory) || passMarksTheory < 1) {
    return { error: "Theory pass marks must be a whole number above zero." };
  }
  if (passMarksTheory > fullMarksTheory) {
    return { error: "Theory pass marks cannot exceed full marks." };
  }
  if (hasPractical) {
    if (!Number.isInteger(fullMarksPractical) || fullMarksPractical < 1) {
      return { error: "Practical full marks must be a whole number above zero." };
    }
    if (!Number.isInteger(passMarksPractical) || passMarksPractical < 1) {
      return { error: "Practical pass marks must be a whole number above zero." };
    }
    if (passMarksPractical > fullMarksPractical) {
      return { error: "Practical pass marks cannot exceed full marks." };
    }
  }

  await updateOffering(id, {
    hasPractical,
    fullMarksTheory,
    passMarksTheory,
    fullMarksPractical,
    passMarksPractical,
  });

  revalidatePath(PATH);
  return { success: "Offering saved." };
}
