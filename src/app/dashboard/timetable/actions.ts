"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { listBellPeriods, saveBellSchedule, setWorkingDays } from "@/lib/timetable/bell";
import { BellScheduleError, type BellPeriod } from "@/lib/timetable/schedule";
import { TimetableCellError, setTimetableCell } from "@/lib/timetable/cells";

export type ActionState = {
  error?: string;
  success?: string;
  // Only saveBell sets this. The client adopts it as the new local rows so a
  // second save in the same visit sends the real ids the server just assigned
  // — see the comment on SchoolDayForm's rows state.
  rows?: BellPeriod[];
};

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
  // Re-read rather than trust the submitted rows: ids assigned by create() are
  // otherwise never reported back, and the form must adopt them before the
  // next save or it deletes-and-recreates the very row it just added.
  return { success: "School day saved.", rows: await listBellPeriods() };
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
