import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { capabilityFor, type Capability } from "./roles";
import { granted, loadGrants } from "./permissions";
import type { Actor } from "./scope";

export class ForbiddenError extends Error {}

export type { Actor };
export { allowedSectionIds, canEnterMarks, canTakeAttendance } from "./scope";

/// Reads the signed-in user from the database rather than the token. The token
/// is issued at sign-in and would keep a role that has since been changed or
/// revoked — fine for routing, not for deciding whether a write is allowed.
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!Number.isInteger(id)) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, staff: { select: { id: true } } },
  });
  if (!user) return null;

  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    staffId: user.staff?.id ?? null,
  };
}

/// The guard every mutating action starts with. Throws rather than returning a
/// value, so forgetting to check the result cannot leave a hole.
export async function requireCapability(capability: Capability): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new ForbiddenError("You are not signed in.");
  const grants = await loadGrants();
  if (!granted(grants, actor.role, capability)) {
    throw new ForbiddenError("Your account does not have permission to do that.");
  }
  return actor;
}

/// Page-level guard. Route protection lives here rather than in middleware,
/// because middleware runs on the Edge without database access and would have
/// to trust a token that predates any permission change.
export async function requirePage(pathname: string): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const capability = capabilityFor(pathname);
  if (capability === null) return actor;

  const grants = await loadGrants();
  if (!granted(grants, actor.role, capability)) redirect("/dashboard?denied=1");
  return actor;
}
