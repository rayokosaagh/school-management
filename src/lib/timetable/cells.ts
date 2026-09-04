import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkingDays } from "./bell";
import { DAY_NAMES } from "./schedule";

// The single write path for the timetable. Every rule a cell has to satisfy
// lives here, in the order a person would check them, because the server action
// above it is a public HTTP endpoint and the grid above that is only a hint.

export class TimetableCellError extends Error {}

/// A teacher cannot be in two rooms at once. Separate from the base error so
/// the UI can point at the other class rather than only refusing.
export class TimetableClashError extends TimetableCellError {}

export type CellInput = {
  sectionId: number;
  schoolPeriodId: number;
  dayOfWeek: number;
  /// Null clears the slot. Clearing is the same call as filling, not a second
  /// action, so the grid has one write path and one place to be wrong.
  subjectOfferingId: number | null;
  room?: string;
};

export async function setTimetableCell(input: CellInput): Promise<void> {
  const { sectionId, schoolPeriodId, dayOfWeek } = input;

  // kind replaces isBreak (see day-shapes.ts); the EVENT case is left to the
  // timetable UI task, which is what will ever produce one of those.
  const period = await prisma.schoolPeriod.findUnique({
    where: { id: schoolPeriodId },
    select: { id: true, name: true, kind: true },
  });
  if (!period) throw new TimetableCellError("That period is no longer in the school day.");
  if (period.kind === "BREAK") throw new TimetableCellError(`${period.name} is a break, and breaks carry no lessons.`);

  const workingDays = await getWorkingDays();
  if (!workingDays.includes(dayOfWeek)) {
    const day = DAY_NAMES[dayOfWeek] ?? "That day";
    throw new TimetableCellError(`The school does not run on ${day}.`);
  }

  // Clearing needs none of the checks below: there is nothing to validate about
  // an empty slot, and refusing to clear one would strand a bad row.
  if (input.subjectOfferingId === null) {
    await prisma.timetablePeriod.deleteMany({
      where: { sectionId, dayOfWeek, schoolPeriodId },
    });
    return;
  }

  const [section, offering] = await Promise.all([
    prisma.section.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        name: true,
        gradeId: true,
        academicYearId: true,
        grade: { select: { name: true } },
      },
    }),
    prisma.subjectOffering.findUnique({
      where: { id: input.subjectOfferingId },
      select: {
        id: true,
        gradeId: true,
        academicYearId: true,
        subject: { select: { name: true } },
      },
    }),
  ]);

  if (!section) throw new TimetableCellError("That section no longer exists.");
  if (!offering) throw new TimetableCellError("That subject is no longer offered.");

  // Re-checked here for the same reason setSubjectTeacher re-checks it: nothing
  // in the schema stops a Class 9 offering being attached to a Class 5 section.
  if (
    offering.gradeId !== section.gradeId ||
    offering.academicYearId !== section.academicYearId
  ) {
    throw new TimetableCellError(
      "That subject is not taught to this section's grade this year.",
    );
  }

  const sectionLabel = `${section.grade.name} ${section.name}`;

  const assignment = await prisma.teacherAssignment.findFirst({
    where: { sectionId, subjectOfferingId: offering.id },
    select: { id: true, staff: { select: { id: true, fullName: true } } },
  });
  if (!assignment) {
    throw new TimetableCellError(
      `No teacher is assigned to ${offering.subject.name} for ${sectionLabel} yet. ` +
        "Assign one on the Teaching page first.",
    );
  }

  // A teacher in two places at once. Lessons this section already holds in the
  // slot are excluded, because replacing a cell with itself is not a clash.
  const clash = await prisma.timetablePeriod.findFirst({
    where: {
      dayOfWeek,
      schoolPeriodId,
      sectionId: { not: sectionId },
      assignment: { staffId: assignment.staff.id },
    },
    select: {
      section: { select: { name: true, grade: { select: { name: true } } } },
    },
  });
  if (clash) {
    const where = `${clash.section.grade.name} ${clash.section.name}`;
    throw new TimetableClashError(
      `${assignment.staff.fullName} already teaches ${where} in ${period.name}.`,
    );
  }

  // Delete-then-create rather than upsert: the slot may currently hold a
  // different subject, and so a different assignment id, which no unique key
  // on the incoming row would match.
  await prisma.$transaction(async (tx) => {
    await tx.timetablePeriod.deleteMany({
      where: { sectionId, dayOfWeek, schoolPeriodId },
    });
    await tx.timetablePeriod.create({
      data: {
        teacherAssignmentId: assignment.id,
        sectionId,
        schoolPeriodId,
        dayOfWeek,
        room: input.room?.trim() ?? "",
      },
    });
  });
}

/// One section's whole week, or every section's whole week in one academic
/// year — never both meanings at once, so a caller cannot widen the blast
/// radius by accident. See docs/superpowers/specs/2026-09-04-day-shapes-
/// design.md section 6: destructive, no restore point, because a timetable is
/// rebuilt from the assignments it already has.
export type ClearTimetableScope = { sectionId: number } | { academicYearId: number };

function timetableScopeWhere(scope: ClearTimetableScope): Prisma.TimetablePeriodWhereInput {
  return "sectionId" in scope
    ? { sectionId: scope.sectionId }
    : { section: { academicYearId: scope.academicYearId } };
}

/// What clearTimetable would delete, without deleting it — the toolbar shows
/// this count and requires confirmation before the write ever runs, and the
/// two share this one where clause so the preview and the delete cannot
/// disagree about what "the scope" means.
export async function countTimetableRows(scope: ClearTimetableScope): Promise<number> {
  return prisma.timetablePeriod.count({ where: timetableScopeWhere(scope) });
}

/// Deletes every TimetablePeriod row in the given scope and reports how many
/// went. A single deleteMany is already atomic, so there is nothing further
/// to wrap in a transaction. Callers behind manage:timetable are expected to
/// have shown a confirmation naming the count before this is ever called.
export async function clearTimetable(
  scope: ClearTimetableScope,
): Promise<{ deleted: number }> {
  const { count } = await prisma.timetablePeriod.deleteMany({
    where: timetableScopeWhere(scope),
  });
  return { deleted: count };
}
