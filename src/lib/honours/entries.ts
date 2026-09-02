import type { ActivityLevel, ConductKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { toBsInput } from "@/lib/date/bs";

// The two record types behind the conduct and activity pillars. Validation
// lives here rather than only in the form action, so a test can prove it
// without standing up a request.

export class HonoursError extends Error {}

export const MAX_POINTS = 100;

export type ConductInput = {
  studentId: number;
  academicYearId: number;
  kind: ConductKind;
  points: number;
  date: Date;
  note: string;
  recordedById: number | null;
};

export type ActivityInput = {
  studentId: number;
  academicYearId: number;
  name: string;
  level: ActivityLevel;
  points: number;
  date: Date;
  recordedById: number | null;
};

export type ConductRow = { id: number; kind: ConductKind; points: number; dateBs: string; note: string };
export type ActivityRow = { id: number; name: string; level: ActivityLevel; points: number; dateBs: string };

function checkPoints(points: number) {
  if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) {
    throw new HonoursError(`Points must be a whole number from 1 to ${MAX_POINTS}.`);
  }
}

export async function addConduct(input: ConductInput) {
  checkPoints(input.points);
  const note = input.note.trim();
  if (note.length < 2) throw new HonoursError("Say what happened, in a few words.");
  if (note.length > 200) throw new HonoursError("Keep the note under 200 characters.");
  return prisma.conductEntry.create({
    data: {
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      kind: input.kind,
      points: input.points,
      date: input.date,
      note,
      recordedById: input.recordedById,
    },
  });
}

export function deleteConduct(id: number) {
  return prisma.conductEntry.delete({ where: { id } });
}

/// Whose entry this is, so an action can check the actor's scope before
/// deleting. Null when it no longer exists.
export async function conductEntryStudent(id: number): Promise<number | null> {
  const row = await prisma.conductEntry.findUnique({ where: { id }, select: { studentId: true } });
  return row?.studentId ?? null;
}

export async function listConduct(studentId: number, academicYearId: number): Promise<ConductRow[]> {
  const rows = await prisma.conductEntry.findMany({
    where: { studentId, academicYearId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, kind: r.kind, points: r.points, dateBs: toBsInput(r.date), note: r.note }));
}

export async function addActivity(input: ActivityInput) {
  checkPoints(input.points);
  const name = input.name.trim();
  if (name.length < 2) throw new HonoursError("Name the activity.");
  if (name.length > 80) throw new HonoursError("Keep the activity name under 80 characters.");
  return prisma.activityEntry.create({
    data: {
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      name,
      level: input.level,
      points: input.points,
      date: input.date,
      recordedById: input.recordedById,
    },
  });
}

export function deleteActivity(id: number) {
  return prisma.activityEntry.delete({ where: { id } });
}

export async function activityEntryStudent(id: number): Promise<number | null> {
  const row = await prisma.activityEntry.findUnique({ where: { id }, select: { studentId: true } });
  return row?.studentId ?? null;
}

export async function listActivities(studentId: number, academicYearId: number): Promise<ActivityRow[]> {
  const rows = await prisma.activityEntry.findMany({
    where: { studentId, academicYearId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, points: r.points, dateBs: toBsInput(r.date) }));
}
