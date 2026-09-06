CREATE TABLE "AuditEvent" (
  "id" SERIAL NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" INTEGER NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "academicYearId" INTEGER,
  "details" JSONB NOT NULL,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt", "id");
CREATE INDEX "AuditEvent_academicYearId_createdAt_idx" ON "AuditEvent"("academicYearId", "createdAt");

-- No application operation can rewrite/delete history. A database owner can
-- still change schema: this is not a substitute for off-site backups.
CREATE FUNCTION reject_audit_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER "AuditEvent_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_event_change();
