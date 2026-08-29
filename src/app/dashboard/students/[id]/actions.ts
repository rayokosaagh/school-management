"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { numericField } from "@/lib/form";
import {
  PhotoError,
  clearStudentPhoto,
  setStudentPhoto,
} from "@/lib/registry/photos";

export type PhotoState = { error?: string; success?: string };

export async function saveStudentPhoto(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You are not signed in." };

  const studentId = numericField(formData, "studentId");
  if (studentId === null) return { error: "Pick a student." };

  try {
    if (formData.get("removePhoto") === "1") {
      await clearStudentPhoto(studentId);
      revalidatePath(`/dashboard/students/${studentId}`);
      return { success: "Photo removed." };
    }
    await setStudentPhoto(studentId, formData.get("photo"));
  } catch (e) {
    if (e instanceof PhotoError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/students");
  return { success: "Photo saved." };
}
