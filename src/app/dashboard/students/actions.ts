"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, requireCapability } from "@/lib/auth/guard";
import { PhotoError, clearStudentPhoto, setStudentPhoto } from "@/lib/registry/photos";
import { Prisma } from "@/generated/prisma/client";
import type { Gender, GuardianRelation, StudentStatus } from "@/generated/prisma/enums";
import { parseBsInput } from "@/lib/date/bs";
import { NAME_MESSAGES, readNameParts, validateName } from "@/lib/registry/names";
import { numericField } from "@/lib/form";
import {
  addGuardian,
  createStudent,
  deleteGuardian,
  deleteStudent,
  type GuardianInput,
  moveStudent,
  updateGuardian,
  updateStudent,
} from "@/lib/registry/students";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/students";

const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER"];
const RELATIONS: GuardianRelation[] = ["FATHER", "MOTHER", "GUARDIAN"];

/// Every action below is a public HTTP endpoint, so the check lives here
/// rather than in the page that renders the form.
async function requireSession() {
  await requireCapability("manage:registry");
}

export async function addStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const admissionNo = String(formData.get("admissionNo") ?? "").trim();
  const name = readNameParts(formData);
  const fullNameNp = String(formData.get("fullNameNp") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const gender = String(formData.get("gender") ?? "") as Gender;
  const dob = parseBsInput(String(formData.get("dob") ?? ""));
  const admittedOn = parseBsInput(String(formData.get("admittedOn") ?? ""));
  const sectionId = Number(formData.get("sectionId"));
  const academicYearId = Number(formData.get("academicYearId"));

  if (!admissionNo) return { error: "Enter an admission number." };
  const nameError = validateName(name);
  if (nameError) return { error: NAME_MESSAGES[nameError] };
  if (!GENDERS.includes(gender)) return { error: "Pick a gender." };
  if (!dob) return { error: "Date of birth must be a valid BS date." };
  if (!admittedOn) return { error: "Admission date must be a valid BS date." };
  if (dob >= admittedOn) {
    return { error: "Date of birth must come before the admission date." };
  }
  if (!Number.isInteger(sectionId)) return { error: "Pick a section." };
  if (!Number.isInteger(academicYearId)) {
    return { error: "Set a current academic year first." };
  }

  const relation = String(formData.get("guardianRelation") ?? "") as GuardianRelation;
  const guardianName = String(formData.get("guardianName") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();

  if (!RELATIONS.includes(relation)) return { error: "Pick the guardian's relation." };
  if (guardianName.length < 2) return { error: "Enter the guardian's name." };
  if (!/^[0-9+\-\s]{7,15}$/.test(guardianPhone)) {
    return { error: "Enter a valid guardian phone number." };
  }

  // One guardian at admission; more can be added from the student's record.
  const guardians: GuardianInput[] = [
    { relation, fullName: guardianName, phone: guardianPhone, isPrimary: true },
  ];

  try {
    await createStudent({
      admissionNo,
      ...name,
      fullNameNp,
      dob,
      gender,
      address,
      admittedOn,
      guardians,
      enrollment: { sectionId, academicYearId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String(e.meta?.target ?? "");
      return target.includes("admissionNo")
        ? { error: `Admission number ${admissionNo} is already used.` }
        : { error: "That student is already enrolled this year." };
    }
    throw e;
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/classes");
  return { success: `${name.firstName} ${name.lastName} admitted.` };
}

const STATUSES: StudentStatus[] = ["ACTIVE", "LEFT", "GRADUATED"];

export async function editStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = Number(formData.get("studentId"));
  const admissionNo = String(formData.get("admissionNo") ?? "").trim();
  const name = readNameParts(formData);
  const fullNameNp = String(formData.get("fullNameNp") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const gender = String(formData.get("gender") ?? "") as Gender;
  const status = String(formData.get("status") ?? "") as StudentStatus;
  const dob = parseBsInput(String(formData.get("dob") ?? ""));
  const admittedOn = parseBsInput(String(formData.get("admittedOn") ?? ""));

  if (!Number.isInteger(id)) return { error: "Pick a student." };
  if (!admissionNo) return { error: "Enter an admission number." };
  const nameError = validateName(name);
  if (nameError) return { error: NAME_MESSAGES[nameError] };
  if (!GENDERS.includes(gender)) return { error: "Pick a gender." };
  if (!STATUSES.includes(status)) return { error: "Pick a status." };
  if (!dob) return { error: "Date of birth must be a valid BS date." };
  if (!admittedOn) return { error: "Admission date must be a valid BS date." };
  if (dob >= admittedOn) {
    return { error: "Date of birth must come before the admission date." };
  }

  try {
    await updateStudent(id, {
      admissionNo, ...name, fullNameNp, dob, gender, address, admittedOn, status,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `Admission number ${admissionNo} is already used.` };
    }
    throw e;
  }

  revalidatePath(PATH);
  return { success: `${name.firstName} ${name.lastName} saved.` };
}

export async function removeStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = numericField(formData, "studentId");
  if (id === null) return { error: "Pick a student." };

  try {
    await deleteStudent(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Student deleted." };
}

export async function moveStudentSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const studentId = Number(formData.get("studentId"));
  const sectionId = Number(formData.get("sectionId"));
  const academicYearId = Number(formData.get("academicYearId"));

  if (!Number.isInteger(studentId)) return { error: "Pick a student." };
  if (!Number.isInteger(sectionId)) return { error: "Pick a section." };
  if (!Number.isInteger(academicYearId)) return { error: "No academic year set." };

  try {
    await moveStudent(studentId, academicYearId, sectionId);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Student moved. A new roll number was issued." };
}

export async function saveGuardian(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const guardianId = Number(formData.get("guardianId"));
  const studentId = Number(formData.get("studentId"));
  const relation = String(formData.get("relation") ?? "") as GuardianRelation;
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const occupation = String(formData.get("occupation") ?? "").trim();
  const isPrimary = formData.get("isPrimary") === "on";

  if (!RELATIONS.includes(relation)) return { error: "Pick the relation." };
  if (fullName.length < 2) return { error: "Enter the guardian's name." };
  if (!/^[0-9+\-\s]{7,15}$/.test(phone)) return { error: "Enter a valid phone number." };

  const payload = { relation, fullName, phone, occupation, isPrimary };

  if (Number.isInteger(guardianId)) {
    await updateGuardian(guardianId, payload);
  } else if (Number.isInteger(studentId)) {
    await addGuardian(studentId, payload);
  } else {
    return { error: "Pick a student." };
  }

  revalidatePath(PATH);
  return { success: "Guardian saved." };
}

export async function removeGuardian(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = numericField(formData, "guardianId");
  if (id === null) return { error: "Pick a guardian." };

  try {
    await deleteGuardian(id);
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Guardian removed." };
}

export type PhotoState = { error?: string; success?: string };

/// The photo lives with the rest of the student's record now that the profile
/// is a pane on this page rather than its own route.
export async function saveStudentPhoto(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  // Same capability as every other write on this page — a signed-in reader
  // must not be able to change a student's photo.
  try {
    await requireSession();
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const studentId = numericField(formData, "studentId");
  if (studentId === null) return { error: "Pick a student." };

  try {
    if (formData.get("removePhoto") === "1") {
      await clearStudentPhoto(studentId);
      revalidatePath(PATH);
      return { success: "Photo removed." };
    }
    await setStudentPhoto(studentId, formData.get("photo"));
  } catch (e) {
    if (e instanceof PhotoError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Photo saved." };
}
