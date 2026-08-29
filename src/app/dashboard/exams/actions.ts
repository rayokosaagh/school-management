"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  ForbiddenError,
  canEnterMarks,
  requireCapability,
} from "@/lib/auth/guard";
import { parseBsInput } from "@/lib/date/bs";
import { numericField } from "@/lib/form";
import {
  AssessmentError,
  createExamTerm,
  deleteExamTerm,
  saveMarks,
  setExamPublished,
  updateExamTerm,
  type MarkEntry,
} from "@/lib/assessment/exams";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/exams";

/// Setting up and publishing exams is structural; entering marks is not, and is
/// checked separately below.
async function requireSession() {
  await requireCapability("manage:exams");
}

function isDuplicate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function addExamTerm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const academicYearId = Number(formData.get("academicYearId"));
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = parseBsInput(String(formData.get("startsOn") ?? ""));
  const endsOn = parseBsInput(String(formData.get("endsOn") ?? ""));

  if (!Number.isInteger(academicYearId)) return { error: "Set a current academic year first." };
  if (name.length < 2) return { error: "Name the exam, such as First Terminal." };
  if (startsOn && endsOn && endsOn < startsOn) {
    return { error: "The exam cannot end before it starts." };
  }

  try {
    await createExamTerm({ academicYearId, name, startsOn, endsOn });
  } catch (e) {
    if (isDuplicate(e)) return { error: `${name} already exists this year.` };
    throw e;
  }

  revalidatePath(PATH);
  return { success: `${name} added.` };
}

export async function editExamTerm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = Number(formData.get("examTermId"));
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = parseBsInput(String(formData.get("startsOn") ?? ""));
  const endsOn = parseBsInput(String(formData.get("endsOn") ?? ""));

  if (!Number.isInteger(id)) return { error: "Pick an exam." };
  if (name.length < 2) return { error: "Name the exam." };
  if (startsOn && endsOn && endsOn < startsOn) {
    return { error: "The exam cannot end before it starts." };
  }

  try {
    await updateExamTerm(id, { name, startsOn, endsOn });
  } catch (e) {
    if (isDuplicate(e)) return { error: `${name} already exists this year.` };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Exam saved." };
}

export async function togglePublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = Number(formData.get("examTermId"));
  const publish = formData.get("publish") === "1";
  if (!Number.isInteger(id)) return { error: "Pick an exam." };

  await setExamPublished(id, publish);
  revalidatePath(PATH);
  return {
    success: publish
      ? "Results published. Marks are now locked."
      : "Unpublished. Marks can be edited again.",
  };
}

export async function removeExamTerm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "examTermId");
  if (id === null) return { error: "Pick an exam." };

  try {
    await deleteExamTerm(id);
  } catch (e) {
    if (e instanceof AssessmentError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  return { success: "Exam deleted." };
}

/// Reads a number field, distinguishing "left blank" from "typed a zero".
function readMark(raw: FormDataEntryValue | null): number | null | "invalid" {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) return "invalid";
  return value;
}

export async function saveMarksSheet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const examTermId = Number(formData.get("examTermId"));
  const sectionId = Number(formData.get("sectionId"));
  const subjectOfferingId = Number(formData.get("subjectOfferingId"));

  if (!Number.isInteger(examTermId)) return { error: "Pick an exam." };
  if (!Number.isInteger(sectionId)) return { error: "Pick a section." };
  if (!Number.isInteger(subjectOfferingId)) return { error: "Pick a subject." };

  // Scoped to the exact section-subject pairs assigned to a teacher. Being class
  // teacher of a section does not mean marking every paper in it.
  try {
    const actor = await requireCapability("enter:marks");
    if (!(await canEnterMarks(actor, sectionId, subjectOfferingId))) {
      return { error: "You are not assigned to teach that subject in that section." };
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const entries: MarkEntry[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("theory-")) continue;
    const studentId = Number(key.slice("theory-".length));
    if (!Number.isInteger(studentId)) return { error: "That sheet is malformed." };

    const isAbsent = formData.get(`absent-${studentId}`) === "on";
    const theory = readMark(value);
    const practical = readMark(formData.get(`practical-${studentId}`));

    if (theory === "invalid" || practical === "invalid") {
      return { error: "Marks must be whole numbers of zero or more." };
    }

    entries.push({ studentId, theory, practical, isAbsent });
  }

  if (entries.length === 0) return { error: "Nobody is enrolled in that section." };

  try {
    await saveMarks(examTermId, sectionId, subjectOfferingId, entries);
  } catch (e) {
    if (e instanceof AssessmentError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  const entered = entries.filter((e) => e.isAbsent || e.theory !== null).length;
  return { success: `Saved ${entered} of ${entries.length} student(s).` };
}
