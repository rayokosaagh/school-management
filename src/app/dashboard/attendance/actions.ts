"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  canTakeAttendance,
  requireCapability,
} from "@/lib/auth/guard";
import { parseBsInput } from "@/lib/date/bs";
import { AttendanceError, type Entry, saveSheet } from "@/lib/attendance/attendance";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/attendance";
const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "LEAVE"];



export async function saveAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sectionId = Number(formData.get("sectionId"));
  const date = parseBsInput(String(formData.get("date") ?? ""));

  if (!Number.isInteger(sectionId)) return { error: "Pick a section." };
  if (!date) return { error: "Enter a valid BS date." };

  // A teacher may only take the register for sections they lead or teach in.
  try {
    const actor = await requireCapability("take:attendance");
    if (!(await canTakeAttendance(actor, sectionId))) {
      return { error: "You do not take attendance for that section." };
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  // Statuses arrive as status-<studentId>, so the roster shape lives in the form
  // rather than needing a parallel list of ids.
  const entries: Entry[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status-")) continue;

    const studentId = Number(key.slice("status-".length));
    const status = String(value) as AttendanceStatus;
    if (!Number.isInteger(studentId)) return { error: "That sheet is malformed." };
    if (!STATUSES.includes(status)) return { error: "Unknown attendance status." };

    // A reason only means something for leave; anything typed against another
    // status is dropped rather than stored where nothing will show it.
    const note =
      status === "LEAVE"
        ? String(formData.get(`note-${studentId}`) ?? "").trim().slice(0, 200)
        : null;

    entries.push({ studentId, status, note });
  }

  if (entries.length === 0) return { error: "Nobody is enrolled in that section." };

  try {
    await saveSheet({ sectionId, date, entries });
  } catch (e) {
    if (e instanceof AttendanceError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  const absent = entries.filter((e) => e.status === "ABSENT").length;
  return {
    success: `Saved ${entries.length} student${entries.length === 1 ? "" : "s"}, ${absent} absent.`,
  };
}
