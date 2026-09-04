"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, canRecordConduct, requireCapability } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import {
  HonoursError,
  activityEntryStudent,
  addActivity,
  addConduct,
  conductEntryStudent,
  deleteActivity,
  deleteConduct,
} from "@/lib/honours/entries";
import { PhotoError, clearStudentPhoto, setStudentPhoto } from "@/lib/registry/photos";
import { Prisma } from "@/generated/prisma/client";
import type { ActivityLevel, ConductKind, Gender, GuardianRelation, StudentStatus } from "@/generated/prisma/enums";
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

// `token` is not shown anywhere; it exists so a UI that needs to recognise
// *this particular* success — closing a form, say — can tell it apart from
// an earlier one that happened to carry the same `success` text (e.g. two
// merits recorded back to back both read "Merit recorded."). Actions whose
// message is already unique per call (a person's name, say) can leave it out.
export type ActionState = { error?: string; success?: string; token?: number };

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

const CONDUCT_KINDS: ConductKind[] = ["MERIT", "DEMERIT"];
const ACTIVITY_LEVELS: ActivityLevel[] = ["PARTICIPATED", "PLACED", "WON"];

/// The capability, then the scope: a teacher records only for the sections
/// they take the register for. Returns what the write needs, or the message
/// to show.
async function recordingContext(studentId: number) {
  const actor = await requireCapability("record:conduct");
  const year = await getCurrentAcademicYear();
  if (!year) return { error: "No academic year is current." } as const;

  const enrolment = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
    select: { sectionId: true },
  });
  if (!enrolment) return { error: "That student is not enrolled this year." } as const;

  if (!(await canRecordConduct(actor, enrolment.sectionId))) {
    return { error: "Only teachers of this student's section can record for them." } as const;
  }
  return { actor, year } as const;
}

function readDate(formData: FormData, year: { startsOn: Date; endsOn: Date }) {
  const date = parseBsInput(String(formData.get("dateBs") ?? ""));
  if (!date) return { error: "Enter a valid date (YYYY-MM-DD in BS)." } as const;
  if (date < year.startsOn || date > year.endsOn) {
    return { error: "The date must fall within the current academic year." } as const;
  }
  return { date } as const;
}

export async function saveConduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = numericField(formData, "studentId");
  if (studentId === null) return { error: "Pick a student." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  const kind = String(formData.get("kind") ?? "") as ConductKind;
  if (!CONDUCT_KINDS.includes(kind)) return { error: "Pick merit or demerit." };
  const points = Number(String(formData.get("points") ?? "").trim());
  const when = readDate(formData, context.year);
  if ("error" in when) return { error: when.error };

  let entry;
  try {
    entry = await addConduct({
      studentId,
      academicYearId: context.year.id,
      kind,
      points,
      date: when.date,
      note: String(formData.get("note") ?? ""),
      recordedById: context.actor.userId,
    });
  } catch (e) {
    if (e instanceof HonoursError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return {
    success: kind === "MERIT" ? "Merit recorded." : "Demerit recorded.",
    token: entry.id,
  };
}

export async function removeConduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = numericField(formData, "conductId");
  if (id === null) return { error: "Pick an entry." };
  const studentId = await conductEntryStudent(id);
  if (studentId === null) return { error: "That entry is already gone." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  await deleteConduct(id);
  revalidatePath(PATH);
  return { success: "Entry removed." };
}

export async function saveActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = numericField(formData, "studentId");
  if (studentId === null) return { error: "Pick a student." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  const level = String(formData.get("level") ?? "") as ActivityLevel;
  if (!ACTIVITY_LEVELS.includes(level)) return { error: "Pick how they did." };
  const points = Number(String(formData.get("points") ?? "").trim());
  const when = readDate(formData, context.year);
  if ("error" in when) return { error: when.error };

  let entry;
  try {
    entry = await addActivity({
      studentId,
      academicYearId: context.year.id,
      name: String(formData.get("name") ?? ""),
      level,
      points,
      date: when.date,
      recordedById: context.actor.userId,
    });
  } catch (e) {
    if (e instanceof HonoursError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Activity recorded.", token: entry.id };
}

export async function removeActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = numericField(formData, "activityId");
  if (id === null) return { error: "Pick an entry." };
  const studentId = await activityEntryStudent(id);
  if (studentId === null) return { error: "That entry is already gone." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  await deleteActivity(id);
  revalidatePath(PATH);
  return { success: "Entry removed." };
}
