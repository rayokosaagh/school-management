"use server";

import { revalidatePath } from "next/cache";
import type { AnnouncementAudience } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { ForbiddenError, currentActor, requireCapability } from "@/lib/auth/guard";
import { parseBsInput } from "@/lib/date/bs";
import { numericField } from "@/lib/form";
import {
  AnnouncementError,
  createAnnouncement,
  deleteAnnouncement,
  markAllRead,
  markRead,
  updateAnnouncement,
} from "@/lib/announcements/announcements";
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
    const actor = await requireCapability("manage:registry");
    await setCurrentAcademicYear(id, actor);
  } catch (e) {
    if (e instanceof UnknownYearError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  // Every page under the dashboard reads the current year, so the whole segment
  // has to be rebuilt rather than just the page that happened to be open.
  revalidatePath("/dashboard", "layout");
  return { success: "Academic year switched." };
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/// `token` carries the id of the notice just written, so two identical
/// successes are two toasts rather than one swallowed by the de-duplicator.
export type AnnouncementState = { error?: string; success?: string; token?: number };

function announcementFailure(error: unknown, fallback: string): AnnouncementState {
  if (error instanceof ForbiddenError || error instanceof AnnouncementError) {
    return { error: error.message };
  }
  return { error: fallback };
}

/// Reads the compose form. The audience arrives as a string from a select, so
/// it is narrowed here rather than trusted into the enum column.
function announcementInput(data: FormData) {
  const raw = String(data.get("audience") ?? "ALL");
  const audience: AnnouncementAudience =
    raw === "TEACHER" || raw === "OFFICE" ? raw : "ALL";

  const rawExpiry = String(data.get("expiresOn") ?? "").trim();
  const expiresOn = rawExpiry === "" ? null : parseBsInput(rawExpiry);
  if (rawExpiry !== "" && expiresOn === null) {
    throw new AnnouncementError("That expiry date is not a real BS date.");
  }

  return {
    title: String(data.get("title") ?? ""),
    body: String(data.get("body") ?? ""),
    audience,
    isPinned: data.get("isPinned") === "on" || data.get("isPinned") === "true",
    expiresOn,
  };
}

export async function postAnnouncement(
  _prev: AnnouncementState,
  data: FormData,
): Promise<AnnouncementState> {
  try {
    const actor = await requireCapability("post:announcements");
    const made = await createAnnouncement(actor.userId, announcementInput(data));
    revalidatePath("/dashboard");
    return { success: `${made.title} posted.`, token: made.id };
  } catch (e) {
    return announcementFailure(e, "Could not post that announcement.");
  }
}

export async function editAnnouncement(
  _prev: AnnouncementState,
  data: FormData,
): Promise<AnnouncementState> {
  const id = numericField(data, "announcementId");
  if (id === null) return { error: "Choose an announcement." };
  try {
    await requireCapability("post:announcements");
    const saved = await updateAnnouncement(id, announcementInput(data));
    revalidatePath("/dashboard");
    return { success: `${saved.title} updated.`, token: saved.id };
  } catch (e) {
    return announcementFailure(e, "Could not update that announcement.");
  }
}

export async function withdrawAnnouncement(
  _prev: AnnouncementState,
  data: FormData,
): Promise<AnnouncementState> {
  const id = numericField(data, "announcementId");
  if (id === null) return { error: "Choose an announcement." };
  try {
    await requireCapability("post:announcements");
    const gone = await deleteAnnouncement(id);
    revalidatePath("/dashboard");
    return { success: `${gone.title} withdrawn.`, token: gone.id };
  } catch (e) {
    return announcementFailure(e, "Could not withdraw that announcement.");
  }
}

/// Marking as read needs no capability beyond being signed in — it is a note
/// about the reader, not a change to the notice.
export async function readAnnouncement(
  _prev: AnnouncementState,
  data: FormData,
): Promise<AnnouncementState> {
  const id = numericField(data, "announcementId");
  if (id === null) return { error: "Choose an announcement." };
  const actor = await currentActor();
  if (!actor) return { error: "You are not signed in." };
  await markRead(id, actor.userId);
  revalidatePath("/dashboard");
  return { token: id };
}

export async function readAllAnnouncements(
  prev: AnnouncementState,
  data: FormData,
): Promise<AnnouncementState> {
  // Both are useActionState's shape rather than this action's input: marking
  // everything read takes no fields and starts from no prior state.
  void prev;
  void data;
  const actor = await currentActor();
  if (!actor) return { error: "You are not signed in." };
  const count = await markAllRead(actor);
  revalidatePath("/dashboard");
  return count > 0 ? { success: `${count} marked as read.`, token: count } : {};
}
