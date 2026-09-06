import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditActor = { userId: number; username: string };
export type AuditRecord = {
  action: string;
  entityType: string;
  entityId: number | string;
  academicYearId?: number;
  // Deliberately small, explicit metadata. Never pass FormData, credentials,
  // payer details, student names or entire before/after model objects here.
  details: Record<string, string | number | boolean | null>;
};

/** Use the mutation's transaction. Audit failure must roll back the change. */
export async function writeAuditEvent(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  actor: AuditActor,
  event: AuditRecord,
) {
  if (!Number.isSafeInteger(actor.userId) || actor.userId <= 0 || !actor.username.trim()) {
    throw new Error("An authenticated actor is required for audit history.");
  }
  // Parameterized SQL keeps the additive table compatible with an already
  // running Prisma client during deployment; no generated delegate required.
  await tx.$executeRaw`
    INSERT INTO "AuditEvent" ("actorUserId", "actorUsername", "action", "entityType", "entityId", "academicYearId", "details")
    VALUES (${actor.userId}, ${actor.username}, ${event.action}, ${event.entityType}, ${String(event.entityId)}, ${event.academicYearId ?? null}, ${JSON.stringify(event.details)}::jsonb)
  `;
}

export type AuditRow = {
  id: number; createdAt: Date; actorUsername: string; action: string;
  entityType: string; entityId: string; academicYearId: number | null;
  details: AuditRecord["details"];
};

/** Caller must enforce manage:settings. Cursor pagination is stable under new writes. */
export async function listAuditEvents(before?: number) {
  return prisma.$queryRaw<AuditRow[]>`
    SELECT "id", "createdAt", "actorUsername", "action", "entityType", "entityId", "academicYearId", "details"
    FROM "AuditEvent" WHERE (${before ?? null}::integer IS NULL OR "id" < ${before ?? null}::integer)
    ORDER BY "id" DESC LIMIT 51
  `;
}
