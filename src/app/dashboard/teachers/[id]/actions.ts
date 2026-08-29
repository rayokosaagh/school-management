"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { PhotoError, clearStaffPhoto, setStaffPhoto } from "@/lib/registry/photos";
import { numericField } from "@/lib/form";

export type PhotoState = { error?: string; success?: string };

export async function saveStaffPhoto(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You are not signed in." };

  const staffId = numericField(formData, "staffId");
  if (staffId === null) return { error: "Pick a staff member." };

  try {
    if (formData.get("removePhoto") === "1") {
      await clearStaffPhoto(staffId);
      revalidatePath(`/dashboard/teachers/${staffId}`);
      return { success: "Photo removed." };
    }
    await setStaffPhoto(staffId, formData.get("photo"));
  } catch (e) {
    if (e instanceof PhotoError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/dashboard/teachers/${staffId}`);
  revalidatePath("/dashboard/teachers");
  return { success: "Photo saved." };
}
