"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { parseBsInput } from "@/lib/date/bs";
import { NAME_MESSAGES, readNameParts, validateName } from "@/lib/registry/names";
import {
  createStaff,
  deleteStaff,
  setStaffActive,
  updateStaff,
} from "@/lib/registry/staff";
import { setClassTeacher } from "@/lib/registry/structure";
import { numericField } from "@/lib/form";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/teachers";

/// Every action below is a public HTTP endpoint, so the check lives here
/// rather than in the page that renders the form.
async function requireSession() {
  await requireCapability("manage:registry");
}

export async function addStaff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const name = readNameParts(formData);
  const fullNameNp = String(formData.get("fullNameNp") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const designation = String(formData.get("designation") ?? "").trim();
  const joinedOn = parseBsInput(String(formData.get("joinedOn") ?? ""));

  const nameError = validateName(name);
  if (nameError) return { error: NAME_MESSAGES[nameError] };
  if (!/^[0-9+\-\s]{7,15}$/.test(phone)) {
    return { error: "Enter a valid phone number." };
  }
  if (!designation) return { error: "Enter a designation, such as Teacher." };
  if (!joinedOn) return { error: "Joining date must be a valid BS date." };

  await createStaff({ ...name, fullNameNp, phone, designation, joinedOn });

  revalidatePath(PATH);
  return { success: `${name.firstName} ${name.lastName} added.` };
}

export async function toggleStaffActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "staffId");
  const isActive = formData.get("isActive") === "true";
  if (id === null) return { error: "Pick a staff member." };

  await setStaffActive(id, isActive);
  revalidatePath(PATH);
  return { success: isActive ? "Marked active." : "Marked as left." };
}

export async function assignClassTeacher(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const sectionId = numericField(formData, "sectionId");
  const raw = String(formData.get("classTeacherId") ?? "");
  if (sectionId === null) return { error: "Pick a section." };

  // An empty value clears the class teacher rather than failing.
  const classTeacherId = raw === "" ? null : Number(raw);
  if (classTeacherId !== null && !Number.isInteger(classTeacherId)) {
    return { error: "Pick a teacher." };
  }

  await setClassTeacher(sectionId, classTeacherId);
  revalidatePath(PATH);
  revalidatePath("/dashboard/classes");
  return { success: "Class teacher updated." };
}

export async function editStaff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = Number(formData.get("staffId"));
  const name = readNameParts(formData);
  const fullNameNp = String(formData.get("fullNameNp") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const designation = String(formData.get("designation") ?? "").trim();
  const joinedOn = parseBsInput(String(formData.get("joinedOn") ?? ""));

  if (!Number.isInteger(id)) return { error: "Pick a staff member." };
  const nameError = validateName(name);
  if (nameError) return { error: NAME_MESSAGES[nameError] };
  if (!/^[0-9+\-\s]{7,15}$/.test(phone)) return { error: "Enter a valid phone number." };
  if (!designation) return { error: "Enter a designation." };
  if (!joinedOn) return { error: "Joining date must be a valid BS date." };

  await updateStaff(id, { ...name, fullNameNp, phone, designation, joinedOn });

  revalidatePath(PATH);
  return { success: `${name.firstName} ${name.lastName} saved.` };
}

export async function removeStaff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = numericField(formData, "staffId");
  if (id === null) return { error: "Pick a staff member." };

  try {
    await deleteStaff(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Staff record deleted." };
}
