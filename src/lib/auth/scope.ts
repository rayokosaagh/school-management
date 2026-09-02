import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { granted, loadGrants } from "./permissions";

// Who may reach which section and subject. Deliberately free of next-auth: these
// are database questions, and keeping them separate lets them be tested without
// standing up a request.

export type Actor = {
  userId: number;
  username: string;
  role: Role;
  /// The staff record this login belongs to, when one is linked. Teacher scoping
  /// needs it; an unlinked teacher can reach nothing of their own.
  staffId: number | null;
};

/// Sections a teacher may take attendance for: the ones they lead as class
/// teacher, plus any they teach a subject in. Other roles are unrestricted.
export async function allowedSectionIds(actor: Actor): Promise<number[] | "all"> {
  if (actor.role !== "TEACHER") return "all";
  if (actor.staffId === null) return [];

  const [led, taught] = await Promise.all([
    prisma.section.findMany({
      where: { classTeacherId: actor.staffId },
      select: { id: true },
    }),
    prisma.teacherAssignment.findMany({
      where: { staffId: actor.staffId },
      select: { sectionId: true },
    }),
  ]);

  return [...new Set([...led.map((s) => s.id), ...taught.map((t) => t.sectionId)])];
}

/// Whether this actor may enter marks for one subject in one section. A teacher
/// is limited to the exact pairs assigned to them, not to whole sections — being
/// class teacher of 5A does not mean marking its Science papers.
export async function canEnterMarks(
  actor: Actor,
  sectionId: number,
  subjectOfferingId: number,
): Promise<boolean> {
  if (actor.role !== "TEACHER") {
    return granted(await loadGrants(), actor.role, "enter:marks");
  }
  if (actor.staffId === null) return false;

  const assignment = await prisma.teacherAssignment.findFirst({
    where: { staffId: actor.staffId, sectionId, subjectOfferingId },
    select: { id: true },
  });
  return assignment !== null;
}

export async function canTakeAttendance(actor: Actor, sectionId: number) {
  const allowed = await allowedSectionIds(actor);
  return allowed === "all" || allowed.includes(sectionId);
}

/// Roll numbers belong to the class, so the section's own class teacher may
/// reorder them as well as anyone who can manage the registry.
export async function canReorderRolls(actor: Actor, sectionId: number) {
  if (granted(await loadGrants(), actor.role, "manage:registry")) return true;
  if (actor.staffId === null) return false;

  const section = await prisma.section.findFirst({
    where: { id: sectionId, classTeacherId: actor.staffId },
    select: { id: true },
  });
  return section !== null;
}

/// Conduct and activities follow the attendance rule: a teacher records for
/// the sections they take the register for. The capability itself is checked
/// separately by the action.
export async function canRecordConduct(actor: Actor, sectionId: number) {
  return canTakeAttendance(actor, sectionId);
}
