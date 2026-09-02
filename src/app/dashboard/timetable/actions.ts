"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { saveBellSchedule, setWorkingDays } from "@/lib/timetable/bell";
import { BellScheduleError } from "@/lib/timetable/schedule";
import { TimetableCellError, setTimetableCell } from "@/lib/timetable/cells";

export type ActionState = { error?: string; success?: string };

const PATH = "/dashboard/timetable";

/// Every action below is a public HTTP endpoint, so the check lives here rather
/// than in the page that renders the grid.
async function requireSession() {
  await requireCapability("manage:timetable");
}

/// The Overview panel reads the same rows, so it is revalidated alongside.
function revalidate() {
  revalidatePath(PATH);
  revalidatePath("/dashboard");
}

export async function setCell(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const sectionId = Number(formData.get("sectionId"));
  const schoolPeriodId = Number(formData.get("schoolPeriodId"));
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const raw = String(formData.get("subjectOfferingId") ?? "");

  if (!Number.isInteger(sectionId)) return { error: "Pick a class." };
  if (!Number.isInteger(schoolPeriodId)) return { error: "Pick a period." };
  if (!Number.isInteger(dayOfWeek)) return { error: "Pick a day." };

  // Empty clears the slot rather than failing.
  const subjectOfferingId = raw === "" ? null : Number(raw);
  if (subjectOfferingId !== null && !Number.isInteger(subjectOfferingId)) {
    return { error: "Pick a subject." };
  }

  try {
    await setTimetableCell({
      sectionId,
      schoolPeriodId,
      dayOfWeek,
      subjectOfferingId,
      room: String(formData.get("room") ?? ""),
    });
  } catch (e) {
    if (e instanceof TimetableCellError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { success: subjectOfferingId === null ? "Period cleared." : "Period set." };
}

export async function saveBell(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  // The form owns a whole schedule, not a field at a time: the rules are about
  // how the rows sit together, so they can only be checked as a set.
  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "The school day could not be read." };
  }
  if (!Array.isArray(rows)) return { error: "The school day could not be read." };

  try {
    await saveBellSchedule(
      rows.map((row) => ({
        id: typeof row.id === "number" ? row.id : undefined,
        order: Number(row.order),
        name: String(row.name ?? ""),
        startMinute: Number(row.startMinute),
        endMinute: Number(row.endMinute),
        isBreak: Boolean(row.isBreak),
      })),
    );
  } catch (e) {
    if (e instanceof BellScheduleError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { success: "School day saved." };
}

export async function saveDays(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const days = formData.getAll("day").map(Number);

  try {
    await setWorkingDays(days);
  } catch (e) {
    if (e instanceof BellScheduleError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { success: "Working days saved." };
}
