ALTER TYPE "FeeBillingScope" ADD VALUE 'STUDENT';
CREATE TABLE "StudentFeePlan" (
  "id" SERIAL PRIMARY KEY,
  "academicYearId" INTEGER NOT NULL REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "feeHeadId" INTEGER NOT NULL REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "StudentFeePlan_academicYearId_feeHeadId_key" ON "StudentFeePlan"("academicYearId", "feeHeadId");
CREATE TABLE "StudentFeeAssignment" (
  "id" SERIAL PRIMARY KEY,
  "planId" INTEGER NOT NULL REFERENCES "StudentFeePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "enrollmentId" INTEGER NOT NULL REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StudentFeeAssignment_planId_enrollmentId_key" ON "StudentFeeAssignment"("planId", "enrollmentId");
CREATE INDEX "StudentFeeAssignment_enrollmentId_idx" ON "StudentFeeAssignment"("enrollmentId");
ALTER TABLE "Invoice" ADD COLUMN "studentFeeAssignmentId" INTEGER;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentFeeAssignmentId_fkey" FOREIGN KEY ("studentFeeAssignmentId") REFERENCES "StudentFeeAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Invoice_studentFeeAssignmentId_periodMonth_key" ON "Invoice"("studentFeeAssignmentId", "periodMonth");
