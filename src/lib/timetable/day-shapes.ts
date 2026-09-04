import type { Prisma } from "@/generated/prisma/client";
import { PeriodKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Named shapes for a school day, assigned per weekday, so a half-day Friday
// can sit alongside full days without every other day being edited to match.
// See docs/superpowers/specs/2026-09-04-day-shapes-design.md.

export class DayShapeError extends Error {}

export type DayShapePeriod = {
  id: number;
  order: number;
  name: string;
  startMinute: number;
  endMinute: number;
  kind: PeriodKind;
  label: string;
};

export type DayShapeSummary = {
  id: number;
  name: string;
  isDefault: boolean;
  periods: DayShapePeriod[];
  /// Sunday = 0 through Saturday = 6. Every weekday resolves to exactly one
  /// shape — explicit via WeekdayShape, or the default when absent — so this
  /// is the effective set of days running this shape today, not merely the
  /// rows an editor happened to write.
  weekdays: number[];
};

/// Pure: exactly one shape in a list may be the fallback every unassigned
/// weekday resolves to. The schema cannot express "exactly one" — see the
/// isDefault comment in schema.prisma — so it is checked here, on every read,
/// instead. No function in this file ever sets isDefault, so the only way
/// this trips is a row edited outside the library.
export function validateDefaultShape(shapes: { isDefault: boolean }[]): void {
  const defaults = shapes.filter((shape) => shape.isDefault).length;
  if (defaults !== 1) {
    throw new DayShapeError(`Exactly one day shape must be the default; found ${defaults}.`);
  }
}

/// Pure: the rule a period's kind and label must agree on, regardless of
/// which shape it belongs to — an event needs a label to show in the grid,
/// and any other kind carries none. No database in this function, so it can
/// be checked against a draft before it is ever written.
export function validatePeriodKind(period: { kind: PeriodKind; label: string }): void {
  if (period.kind === "EVENT" && period.label.trim() === "") {
    throw new DayShapeError("An event period needs a label.");
  }
  if (period.kind !== "EVENT" && period.label.trim() !== "") {
    throw new DayShapeError("Only an event period carries a label.");
  }
}

/// Every shape with its periods and the weekdays currently running it.
export async function listDayShapes(): Promise<DayShapeSummary[]> {
  const [shapes, assignments] = await Promise.all([
    prisma.dayShape.findMany({
      orderBy: { id: "asc" },
      include: { periods: { orderBy: { order: "asc" } } },
    }),
    prisma.weekdayShape.findMany(),
  ]);

  validateDefaultShape(shapes);

  const defaultShape = shapes.find((shape) => shape.isDefault);
  const explicit = new Map(assignments.map((row) => [row.dayOfWeek, row.dayShapeId]));

  const weekdaysFor = new Map<number, number[]>();
  for (const shape of shapes) weekdaysFor.set(shape.id, []);
  for (let day = 0; day <= 6; day++) {
    const shapeId = explicit.get(day) ?? defaultShape?.id;
    if (shapeId === undefined) continue;
    weekdaysFor.get(shapeId)?.push(day);
  }

  return shapes.map((shape) => ({
    id: shape.id,
    name: shape.name,
    isDefault: shape.isDefault,
    periods: shape.periods,
    weekdays: weekdaysFor.get(shape.id) ?? [],
  }));
}

/// A new shape, optionally starting from another's periods — how "Half day"
/// is born from "Regular day" instead of from a blank schedule.
export async function createDayShape(
  name: string,
  copyFromId?: number,
): Promise<DayShapeSummary> {
  const clean = name.trim();
  if (clean === "") throw new DayShapeError("A day shape needs a name.");

  const existing = await prisma.dayShape.findUnique({ where: { name: clean } });
  if (existing) throw new DayShapeError(`A day shape named "${clean}" already exists.`);

  let sourcePeriods: DayShapePeriod[] = [];
  if (copyFromId !== undefined) {
    const source = await prisma.dayShape.findUnique({
      where: { id: copyFromId },
      include: { periods: { orderBy: { order: "asc" } } },
    });
    if (!source) throw new DayShapeError("The shape to copy from no longer exists.");
    sourcePeriods = source.periods;
    // Belt and braces: a source period should already satisfy this, but a
    // clone is the one place this library writes a kind/label pair it did not
    // just receive from a caller, so it is worth checking rather than assuming.
    for (const period of sourcePeriods) validatePeriodKind(period);
  }

  const created = await prisma.$transaction(async (tx) => {
    const shape = await tx.dayShape.create({ data: { name: clean, isDefault: false } });
    if (sourcePeriods.length > 0) {
      await tx.schoolPeriod.createMany({
        data: sourcePeriods.map((period) => ({
          dayShapeId: shape.id,
          order: period.order,
          name: period.name,
          startMinute: period.startMinute,
          endMinute: period.endMinute,
          kind: period.kind,
          label: period.label,
        })),
      });
    }
    return tx.dayShape.findUniqueOrThrow({
      where: { id: shape.id },
      include: { periods: { orderBy: { order: "asc" } } },
    });
  });

  return {
    id: created.id,
    name: created.name,
    isDefault: created.isDefault,
    periods: created.periods,
    weekdays: [],
  };
}

export async function renameDayShape(id: number, name: string): Promise<void> {
  const clean = name.trim();
  if (clean === "") throw new DayShapeError("A day shape needs a name.");

  const existing = await prisma.dayShape.findUnique({ where: { name: clean } });
  if (existing && existing.id !== id) {
    throw new DayShapeError(`A day shape named "${clean}" already exists.`);
  }

  const shape = await prisma.dayShape.findUnique({ where: { id } });
  if (!shape) throw new DayShapeError("That day shape no longer exists.");

  await prisma.dayShape.update({ where: { id }, data: { name: clean } });
}

/// Refused for the default shape — every unassigned weekday depends on it
/// existing — and refused while any weekday explicitly runs it, mirroring the
/// destructive-operation guard on assignWeekday: deleting a shape someone is
/// using is exactly the same hazard as reassigning it, so it gets the same
/// "refuse rather than silently orphan" treatment.
export async function deleteDayShape(id: number): Promise<void> {
  const shape = await prisma.dayShape.findUnique({ where: { id } });
  if (!shape) throw new DayShapeError("That day shape no longer exists.");
  if (shape.isDefault) throw new DayShapeError("The default day shape cannot be deleted.");

  const inUse = await prisma.weekdayShape.findFirst({ where: { dayShapeId: id } });
  if (inUse) {
    throw new DayShapeError("That day shape is still assigned to a weekday.");
  }

  // Deleting the shape's periods first: SchoolPeriod.dayShapeId is a required
  // foreign key, so the shape row cannot go first. Any lessons still booked
  // into those periods cascade away with them — the same rule the School day
  // form's row-delete already carries.
  await prisma.$transaction(async (tx) => {
    await tx.schoolPeriod.deleteMany({ where: { dayShapeId: id } });
    await tx.dayShape.delete({ where: { id } });
  });
}

export type OrphanedLessons = {
  count: number;
  /// The sections holding a stranded lesson, so the confirmation can name them
  /// rather than just show a number.
  sections: { id: number; name: string; gradeName: string }[];
};

/// Which of a weekday's lessons would be stranded by running `dayShapeId` on
/// it — lessons whose period belongs to some other shape, and so vanishes
/// from a grid built from the new one. Takes an optional transaction client
/// so assignWeekday can count and delete against the same snapshot; called
/// with no client, it reads the live database for the confirmation preview.
export async function orphanedLessons(
  dayOfWeek: number,
  dayShapeId: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<OrphanedLessons> {
  const lessons = await client.timetablePeriod.findMany({
    where: { dayOfWeek, schoolPeriod: { dayShapeId: { not: dayShapeId } } },
    select: {
      section: { select: { id: true, name: true, grade: { select: { name: true } } } },
    },
  });

  const bySection = new Map<number, { id: number; name: string; gradeName: string }>();
  for (const lesson of lessons) {
    bySection.set(lesson.section.id, {
      id: lesson.section.id,
      name: lesson.section.name,
      gradeName: lesson.section.grade.name,
    });
  }

  return { count: lessons.length, sections: [...bySection.values()] };
}

/// One transaction: strand no lesson silently — delete exactly what
/// orphanedLessons would report, then write the assignment. The same query
/// backs both, so the preview a caller showed and the rows this deletes
/// cannot disagree.
export async function assignWeekday(
  dayOfWeek: number,
  dayShapeId: number,
): Promise<{ deletedLessons: number }> {
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new DayShapeError("That is not a day of the week.");
  }

  const shape = await prisma.dayShape.findUnique({ where: { id: dayShapeId } });
  if (!shape) throw new DayShapeError("That day shape no longer exists.");

  return prisma.$transaction(async (tx) => {
    const orphaned = await orphanedLessons(dayOfWeek, dayShapeId, tx);
    if (orphaned.count > 0) {
      await tx.timetablePeriod.deleteMany({
        where: { dayOfWeek, schoolPeriod: { dayShapeId: { not: dayShapeId } } },
      });
    }

    await tx.weekdayShape.upsert({
      where: { dayOfWeek },
      create: { dayOfWeek, dayShapeId },
      update: { dayShapeId },
    });

    return { deletedLessons: orphaned.count };
  });
}
