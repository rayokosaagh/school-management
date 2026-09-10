"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  canTakeAttendance,
  requireCapability,
  requirePage,
} from "@/lib/auth/guard";
import { adToBs, bsMonthLength, bsToAd, parseBsInput } from "@/lib/date/bs";
import {
  AttendanceError,
  classStudentAttendance,
  type ClassAttendanceDetail,
  type Entry,
  saveSheet,
} from "@/lib/attendance/attendance";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/attendance";
const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "LEAVE"];

export type ClassDetailResult = {
  detail: ClassAttendanceDetail | null;
  error: string | null;
};

/// Read-only server function used by the statistics drill-down. Authentication
/// is repeated here because exported server functions are public entry points,
/// even when their caller is already inside a protected page.
export async function loadClassAttendanceDetail(
  sectionId: number,
  period: "monthly" | "yearly",
  dateInput: string,
): Promise<ClassDetailResult> {
  await requirePage(PATH);
  if (!Number.isInteger(sectionId)) return { detail: null, error: "Choose a valid class." };
  if (period !== "monthly" && period !== "yearly") {
    return { detail: null, error: "Choose a valid reporting period." };
  }

  const year = await getCurrentAcademicYear();
  if (!year) return { detail: null, error: "No academic year is current." };

  let from = year.startsOn;
  let to = year.endsOn;
  if (period === "monthly") {
    const date = parseBsInput(dateInput);
    if (!date || date < year.startsOn || date > year.endsOn) {
      return { detail: null, error: "That month is outside the current academic year." };
    }
    const bs = adToBs(date);
    const monthFrom = bsToAd({ year: bs.year, month: bs.month, day: 1 });
    const monthTo = bsToAd({ year: bs.year, month: bs.month, day: bsMonthLength(bs.year, bs.month) });
    from = monthFrom < year.startsOn ? year.startsOn : monthFrom;
    to = monthTo > year.endsOn ? year.endsOn : monthTo;
  }

  try {
    return {
      detail: await classStudentAttendance(sectionId, year.id, from, to),
      error: null,
    };
  } catch (error) {
    if (error instanceof AttendanceError) return { detail: null, error: error.message };
    throw error;
  }
}

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
    // A dropped connection or a slow database is the failure a phone in a
    // classroom actually meets. Rethrowing sends it to the segment's error
    // boundary, which remounts the sheet and discards every mark made since
    // the last save. Returning it keeps the sheet mounted with the marks
    // intact, so "try again" is one press of the same button — and saveSheet
    // replaces the whole day, so a second submit is safe. Logged first: the
    // message below deliberately claims nothing about the cause.
    console.error(e);
    return {
      error: "Couldn't reach the server. Your marks are still on the sheet — try saving again.",
    };
  }

  revalidatePath(PATH);
  const absent = entries.filter((e) => e.status === "ABSENT").length;
  return {
    success: `Saved ${entries.length} student${entries.length === 1 ? "" : "s"}, ${absent} absent.`,
  };
}
