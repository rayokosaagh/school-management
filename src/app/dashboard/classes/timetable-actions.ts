"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { listBellPeriods, saveBellSchedule, setWorkingDays } from "@/lib/timetable/bell";
import { BellScheduleError, type BellPeriod } from "@/lib/timetable/schedule";
import {
  TimetableCellError,
  clearTimetable,
  countTimetableRows,
  setTimetableCell,
  type ClearTimetableScope,
} from "@/lib/timetable/cells";
import {
  DayShapeError,
  assignWeekday,
  createDayShape,
  deleteDayShape,
  orphanedLessons,
  renameDayShape,
  type OrphanedLessons,
} from "@/lib/timetable/day-shapes";
import { numericField } from "@/lib/form";

export type ActionState = {
  error?: string;
  success?: string;
  // Only saveBell sets this. The client adopts it as the new local rows so a
  // second save in the same visit sends the real ids the server just assigned
  // — see the comment on SchoolDayForm's rows state.
  rows?: BellPeriod[];
  // Only createShape sets this, so the panel can switch straight to the shape
  // it just made — the same "adopt what the server assigned" idea as `rows`.
  shapeId?: number;
};

// The Timetable view now lives inside Classes (?view=timetable), not on its
// own route — see nav-model.ts and the redirect in dashboard/timetable/page.tsx.
const PATH = "/dashboard/classes";

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

  const dayShapeId = Number(formData.get("dayShapeId"));
  if (!Number.isInteger(dayShapeId)) return { error: "That day shape no longer exists." };

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
      dayShapeId,
      rows.map((row) => ({
        id: typeof row.id === "number" ? row.id : undefined,
        order: Number(row.order),
        name: String(row.name ?? ""),
        startMinute: Number(row.startMinute),
        endMinute: Number(row.endMinute),
        kind: row.kind === "BREAK" || row.kind === "EVENT" ? row.kind : "TEACHING",
        label: String(row.label ?? ""),
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
  return { success: "School day saved.", rows: await listBellPeriods(dayShapeId) };
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

// ---------------------------------------------------------------------------
// Day shapes: create, rename, delete, and — the destructive one — reassigning
// a weekday. See docs/superpowers/specs/2026-09-04-day-shapes-design.md
// section 4 for why a weekday reassignment needs a preview at all.
// ---------------------------------------------------------------------------

export async function createShape(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const name = String(formData.get("name") ?? "");
  const copyFromId = numericField(formData, "copyFromId") ?? undefined;

  try {
    const shape = await createDayShape(name, copyFromId);
    revalidate();
    return { success: `${shape.name} created.`, shapeId: shape.id };
  } catch (e) {
    if (e instanceof DayShapeError) return { error: e.message };
    throw e;
  }
}

export async function renameShape(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "dayShapeId");
  const name = String(formData.get("name") ?? "");
  if (id === null) return { error: "Pick a day shape." };

  try {
    await renameDayShape(id, name);
  } catch (e) {
    if (e instanceof DayShapeError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { success: "Day shape renamed." };
}

export async function deleteShapeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const id = numericField(formData, "dayShapeId");
  if (id === null) return { error: "Pick a day shape." };

  try {
    await deleteDayShape(id);
  } catch (e) {
    // Refused while a weekday runs it, or while it is the default — surfaced
    // here as the exact message deleteDayShape wrote, not a generic failure.
    if (e instanceof DayShapeError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { success: "Day shape deleted." };
}

/// Feeds the weekday-reassignment dialog its preview: the count and the
/// classes a narrower shape would strand, from the same query assignWeekday
/// itself deletes against, so the two cannot disagree.
export async function previewWeekdayChange(
  dayOfWeek: number,
  dayShapeId: number,
): Promise<{ orphaned?: OrphanedLessons; error?: string }> {
  await requireSession();

  try {
    return { orphaned: await orphanedLessons(dayOfWeek, dayShapeId) };
  } catch (e) {
    if (e instanceof DayShapeError) return { error: e.message };
    throw e;
  }
}

/// Applies a weekday reassignment. The dialog is expected to have shown the
/// preview above and gotten confirmation first; assignWeekday itself deletes
/// the orphaned lessons and writes the assignment in one transaction.
export async function changeWeekdayShape(
  dayOfWeek: number,
  dayShapeId: number,
): Promise<{ deletedLessons?: number; error?: string }> {
  await requireSession();

  try {
    const result = await assignWeekday(dayOfWeek, dayShapeId);
    revalidate();
    return result;
  } catch (e) {
    if (e instanceof DayShapeError) return { error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Clearing a timetable. See spec section 6: no restore point, because a
// timetable is rebuilt from the assignments it already has.
// ---------------------------------------------------------------------------

/// The count the clear-timetable dialog shows before it lets the delete
/// through, built from the same where clause clearTimetable deletes with.
export async function previewClearTimetable(
  scope: ClearTimetableScope,
): Promise<{ count?: number; error?: string }> {
  await requireSession();
  return { count: await countTimetableRows(scope) };
}

export async function runClearTimetable(
  scope: ClearTimetableScope,
): Promise<{ deleted?: number; error?: string }> {
  await requireSession();
  const result = await clearTimetable(scope);
  revalidate();
  return result;
}
