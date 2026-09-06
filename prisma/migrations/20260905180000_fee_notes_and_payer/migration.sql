-- Who handed the money over, and the arrangement behind a part payment.
--
-- Name and phone are snapshots rather than joins: a receipt must keep saying
-- what it said the day it was printed, so a guardian changing their number
-- next year must not rewrite last year's receipt. The guardian link is kept
-- alongside for provenance and nulls out if that guardian row goes.
--
-- Reversing this migration: drop the three columns and the table. Nothing
-- existing depends on them; every column is nullable and every row keeps
-- working without one.

ALTER TABLE "Payment" ADD COLUMN "paidByGuardianId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "paidByName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paidByPhone" TEXT;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_paidByGuardianId_fkey"
  FOREIGN KEY ("paidByGuardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Payment_paidByGuardianId_idx" ON "Payment"("paidByGuardianId");

-- One running note per pupil per year. Not a column on Enrollment: that table
-- belongs to the registry, and this is a fees concern keyed the same way.
CREATE TABLE "FeeNote" (
  "id" SERIAL NOT NULL,
  "enrollmentId" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" INTEGER,
  CONSTRAINT "FeeNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeeNote_enrollmentId_key" ON "FeeNote"("enrollmentId");

ALTER TABLE "FeeNote"
  ADD CONSTRAINT "FeeNote_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeNote"
  ADD CONSTRAINT "FeeNote_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
