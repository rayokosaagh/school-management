import { prisma } from "@/lib/prisma";
import {
  BellScheduleError,
  DEFAULT_WORKING_DAYS,
  validateBell,
  type BellInput,
  type BellPeriod,
} from "./schedule";

// Everything that touches the database. The rules these enforce are in
// schedule.ts, so the form can check a draft before it ever posts.

export type { BellInput, BellPeriod } from "./schedule";

/// One shape's periods, in bell order. The School day editor works on one
/// shape at a time — see day-shapes.ts for how a weekday resolves to one.
export async function listBellPeriods(dayShapeId: number): Promise<BellPeriod[]> {
  return prisma.schoolPeriod.findMany({
    where: { dayShapeId },
    orderBy: { order: "asc" },
  });
}

/// How many lessons each bell period currently carries. The School day form
/// asks before it lets anyone delete a row, because the lessons in that column
/// cascade away with it.
export async function countLessonsByPeriod(): Promise<Map<number, number>> {
  const rows = await prisma.timetablePeriod.groupBy({
    by: ["schoolPeriodId"],
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.schoolPeriodId, row._count._all]));
}

/// Replaces one shape's schedule. Rows carrying an id are updated in place
/// and keep their lessons; rows the editor removed are deleted, and their
/// lessons cascade away with them — which is why the form confirms the count
/// first. The delete is scoped to dayShapeId, not just to "whatever id is not
/// in keep": two shapes can otherwise each be mid-edit, and an empty `rows`
/// on one must never reach into the other's periods.
export async function saveBellSchedule(
  dayShapeId: number,
  rows: (BellInput & { id?: number })[],
): Promise<void> {
  validateBell(rows);

  const keep = rows.flatMap((row) => (row.id === undefined ? [] : [row.id]));

  await prisma.$transaction(async (tx) => {
    await tx.schoolPeriod.deleteMany({ where: { dayShapeId, id: { notIn: keep } } });

    for (const row of rows) {
      const data = {
        order: row.order,
        name: row.name.trim(),
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        kind: row.kind,
        label: row.label.trim(),
        dayShapeId,
      };
      if (row.id === undefined) await tx.schoolPeriod.create({ data });
      else await tx.schoolPeriod.update({ where: { id: row.id }, data });
    }
  });
}

/// The school profile row does not exist until someone fills the settings in,
/// so this falls back the way getLetterhead() falls back to a placeholder
/// masthead rather than failing.
export async function getWorkingDays(): Promise<number[]> {
  const school = await prisma.schoolProfile.findUnique({
    where: { id: 1 },
    select: { workingDays: true },
  });
  const days = school?.workingDays ?? DEFAULT_WORKING_DAYS;
  return days.length === 0 ? DEFAULT_WORKING_DAYS : [...days].sort((a, b) => a - b);
}

export async function setWorkingDays(days: number[]): Promise<void> {
  const clean = [...new Set(days)].sort((a, b) => a - b);
  if (clean.length === 0) {
    throw new BellScheduleError("The school has to run on at least one day.");
  }
  if (clean.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new BellScheduleError("That is not a day of the week.");
  }

  await prisma.schoolProfile.update({
    where: { id: 1 },
    data: { workingDays: clean },
  });
}
