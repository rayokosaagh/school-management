import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent, type AuditActor } from "@/lib/audit";
import { CAPABILITIES, DEFAULT_GRANTS, type Capability } from "./roles";

// The school's own permission matrix. Stored rows override the built-in
// defaults; anything unset falls back, so adding a capability in code does not
// silently deny it to everyone.

export type Grants = Record<Role, Set<Capability>>;

/// Administrators always hold every capability. If the matrix could take
/// `manage:settings` away from them, nobody would be able to grant it back.
export const ADMIN_IS_FIXED = true;

function defaults(): Grants {
  return {
    ADMIN: new Set(DEFAULT_GRANTS.ADMIN),
    OFFICE: new Set(DEFAULT_GRANTS.OFFICE),
    TEACHER: new Set(DEFAULT_GRANTS.TEACHER),
  };
}

/// Reads the matrix from the database. Uncached, so a caller that has just
/// changed a grant — and every test — sees the new state.
export async function readGrants(): Promise<Grants> {
  const grants = defaults();

  const rows = await prisma.rolePermission.findMany();
  for (const row of rows) {
    const capability = row.capability as Capability;
    // Ignore rows for capabilities that no longer exist in the code.
    if (!CAPABILITIES.includes(capability)) continue;
    if (row.role === "ADMIN") continue;
    if (row.granted) grants[row.role].add(capability);
    else grants[row.role].delete(capability);
  }

  // Restated rather than assumed, so a stray row cannot weaken it.
  grants.ADMIN = new Set(CAPABILITIES);
  return grants;
}

/// Cached per request, so a page checking several capabilities makes one query
/// rather than one each. Everything rendering should use this.
export const loadGrants = cache(readGrants);

export function granted(grants: Grants, role: Role, capability: Capability) {
  return grants[role].has(capability);
}

export class PermissionError extends Error {}

/// Writes one cell of the matrix. Only the difference from the default is kept,
/// so the stored rows stay small and a default change still reaches the school.
export async function setGrant(role: Role, capability: Capability, allow: boolean, actor?: AuditActor) {
  if (role === "ADMIN") {
    throw new PermissionError(
      "Administrators always hold every permission, so nobody can be locked out of this page.",
    );
  }
  if (!CAPABILITIES.includes(capability)) {
    throw new PermissionError("Unknown permission.");
  }

  const isDefault = DEFAULT_GRANTS[role].includes(capability) === allow;
  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.rolePermission.deleteMany({ where: { role, capability } });
    } else {
      await tx.rolePermission.upsert({
        where: { role_capability: { role, capability } },
        create: { role, capability, granted: allow },
        update: { granted: allow },
      });
    }
    if (actor) await writeAuditEvent(tx, actor, {
      action: "permission.changed", entityType: "RolePermission", entityId: role,
      details: { capability, allowed: allow },
    });
  });
}

export async function resetGrants(actor?: AuditActor) {
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({});
    if (actor) await writeAuditEvent(tx, actor, {
      action: "permission.reset", entityType: "RolePermission", entityId: "all", details: {},
    });
  });
}
