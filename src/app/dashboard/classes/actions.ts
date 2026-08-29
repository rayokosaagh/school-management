"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { Prisma } from "@/generated/prisma/client";
import {
  createAcademicYear,
  deleteAcademicYear,
  renameAcademicYear,
  UnknownYearError,
  setCurrentAcademicYear,
} from "@/lib/registry/academic-year";
import {
  createGrade,
  createSection,
  deleteGrade,
  deleteSection,
  getSection,
  moveGrade,
  normaliseGradeOrder,
  renameSection,
  updateGrade,
} from "@/lib/registry/structure";
import { resequenceRolls } from "@/lib/registry/students";
import { numericField } from "@/lib/form";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/classes";

// Server actions are public POST endpoints, so every one re-checks the session.
/// Every action below is a public HTTP endpoint, so the check lives here
/// rather than in the page that renders the form.
async function requireSession() {
  await requireCapability("manage:registry");
}

function isDuplicate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function addAcademicYear(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const nameBS = String(formData.get("nameBS") ?? "").trim();

  try {
    await createAcademicYear({ nameBS });
  } catch (e) {
    if (isDuplicate(e)) return { error: `Academic year ${nameBS} already exists.` };
    if (e instanceof RangeError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: `Academic year ${nameBS} added.` };
}

export async function makeYearCurrent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = numericField(formData, "academicYearId");
  if (id === null) return { error: "Pick a year." };

  try {
    await setCurrentAcademicYear(id);
  } catch (e) {
    if (e instanceof UnknownYearError) return { error: e.message };
    throw e;
  }
  revalidatePath(PATH);
  return { success: "Current year updated." };
}

export async function addGrade(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const order = Number(formData.get("order"));

  if (name.length < 1) return { error: "Give the grade a name." };
  if (!Number.isInteger(order) || order < 0) {
    return { error: "Order must be a whole number." };
  }

  try {
    await createGrade({ name, order });
  } catch (e) {
    if (isDuplicate(e)) {
      return { error: `A grade with that name or order already exists.` };
    }
    throw e;
  }

  revalidatePath(PATH);
  return { success: `${name} added.` };
}

export async function addSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim().toUpperCase();
  const gradeId = Number(formData.get("gradeId"));
  const academicYearId = Number(formData.get("academicYearId"));

  if (!name) return { error: "Give the section a name, such as A." };
  if (!Number.isInteger(gradeId)) return { error: "Pick a grade." };
  if (!Number.isInteger(academicYearId)) {
    return { error: "Set a current academic year first." };
  }

  try {
    await createSection({ name, gradeId, academicYearId });
  } catch (e) {
    if (isDuplicate(e)) {
      return { error: `Section ${name} already exists in that grade this year.` };
    }
    throw e;
  }

  revalidatePath(PATH);
  return { success: `Section ${name} added.` };
}

export async function removeSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const sectionId = numericField(formData, "sectionId");
  if (sectionId === null) return { error: "Pick a section." };

  try {
    await deleteSection(sectionId);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Section removed." };
}

export async function editAcademicYear(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = Number(formData.get("academicYearId"));
  const nameBS = String(formData.get("nameBS") ?? "").trim();
  if (!Number.isInteger(id)) return { error: "Pick a year." };

  try {
    await renameAcademicYear(id, nameBS);
  } catch (e) {
    if (isDuplicate(e)) return { error: `Academic year ${nameBS} already exists.` };
    if (e instanceof RangeError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: `Renamed to ${nameBS}.` };
}

export async function removeAcademicYear(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = numericField(formData, "academicYearId");
  if (id === null) return { error: "Pick a year." };

  try {
    await deleteAcademicYear(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Academic year deleted." };
}

export async function editGrade(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = Number(formData.get("gradeId"));
  const name = String(formData.get("name") ?? "").trim();
  const order = Number(formData.get("order"));

  if (!Number.isInteger(id)) return { error: "Pick a grade." };
  if (name.length < 1) return { error: "Give the grade a name." };
  if (!Number.isInteger(order) || order < 0) {
    return { error: "Order must be a whole number." };
  }

  try {
    await updateGrade(id, { name, order });
  } catch (e) {
    if (isDuplicate(e)) return { error: "That name or order is already used." };
    throw e;
  }

  revalidatePath(PATH);
  return { success: `${name} saved.` };
}

export async function removeGrade(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = numericField(formData, "gradeId");
  if (id === null) return { error: "Pick a grade." };

  try {
    await deleteGrade(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Grade deleted." };
}

export async function editSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = Number(formData.get("sectionId"));
  const name = String(formData.get("name") ?? "").trim().toUpperCase();

  if (!Number.isInteger(id)) return { error: "Pick a section." };
  if (!name) return { error: "Give the section a name." };

  try {
    await renameSection(id, name);
  } catch (e) {
    if (isDuplicate(e)) {
      return { error: `Section ${name} already exists in that grade this year.` };
    }
    throw e;
  }

  revalidatePath(PATH);
  return { success: `Renamed to ${name}.` };
}

export async function reorderGrade(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = Number(formData.get("gradeId"));
  const direction = String(formData.get("direction"));

  if (!Number.isInteger(id)) return { error: "Pick a grade." };
  if (direction !== "up" && direction !== "down") {
    return { error: "Choose a direction." };
  }

  const moved = await moveGrade(id, direction);
  if (!moved) return { error: `Already at the ${direction === "up" ? "top" : "bottom"}.` };

  revalidatePath(PATH);
  return { success: "Order updated." };
}

export async function tidyGradeOrder(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Takes no input; the two parameters exist only because useActionState
  // supplies them.
  void prev;
  void formData;

  await requireSession();
  const count = await normaliseGradeOrder();
  revalidatePath(PATH);
  return { success: `Renumbered ${count} grade${count === 1 ? "" : "s"} from zero.` };
}

export async function renumberSectionRolls(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const sectionId = numericField(formData, "sectionId");
  if (sectionId === null) return { error: "Pick a section." };

  const section = await getSection(sectionId);
  if (!section) return { error: "That section no longer exists." };

  const count = await resequenceRolls(sectionId, section.academicYearId);

  revalidatePath(PATH);
  revalidatePath("/dashboard/students");
  return {
    success:
      count === 0
        ? "Nobody is enrolled in that section."
        : `Roll numbers now run 1 to ${count}.`,
  };
}
