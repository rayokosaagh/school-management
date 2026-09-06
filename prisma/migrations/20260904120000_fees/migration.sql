-- Fees are additive: invoices point at the existing, year-scoped Enrollment
-- record, so a promotion can never reinterpret a historic balance.
CREATE TYPE "FeeFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'TERMLY', 'ANNUAL');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'REVERSED');

CREATE TABLE "FeeHead" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeHead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeeHead_name_key" ON "FeeHead"("name");

CREATE TABLE "FeeStructure" (
  "id" SERIAL NOT NULL,
  "academicYearId" INTEGER NOT NULL,
  "gradeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeeStructure_academicYearId_gradeId_name_key" ON "FeeStructure"("academicYearId", "gradeId", "name");

CREATE TABLE "FeeStructureLine" (
  "id" SERIAL NOT NULL,
  "feeStructureId" INTEGER NOT NULL,
  "feeHeadId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "frequency" "FeeFrequency" NOT NULL DEFAULT 'ONE_TIME',
  CONSTRAINT "FeeStructureLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeeStructureLine_feeStructureId_feeHeadId_key" ON "FeeStructureLine"("feeStructureId", "feeHeadId");

CREATE TABLE "Invoice" (
  "id" SERIAL NOT NULL,
  "enrollmentId" INTEGER NOT NULL,
  "academicYearId" INTEGER NOT NULL,
  "feeStructureId" INTEGER,
  "number" TEXT NOT NULL,
  "issuedOn" DATE NOT NULL,
  "dueOn" DATE,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_academicYearId_status_idx" ON "Invoice"("academicYearId", "status");
CREATE INDEX "Invoice_enrollmentId_idx" ON "Invoice"("enrollmentId");
CREATE UNIQUE INDEX "Invoice_enrollmentId_feeStructureId_key" ON "Invoice"("enrollmentId", "feeStructureId");

CREATE TABLE "InvoiceLine" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "feeHeadId" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceLine_feeHeadId_idx" ON "InvoiceLine"("feeHeadId");

CREATE TABLE "Payment" (
  "id" SERIAL NOT NULL,
  "academicYearId" INTEGER NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paidOn" DATE NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "reference" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  "receivedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");
CREATE INDEX "Payment_academicYearId_paidOn_idx" ON "Payment"("academicYearId", "paidOn");

CREATE TABLE "PaymentAllocation" (
  "id" SERIAL NOT NULL,
  "paymentId" INTEGER NOT NULL,
  "invoiceLineId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceLineId_key" ON "PaymentAllocation"("paymentId", "invoiceLineId");
CREATE INDEX "PaymentAllocation_invoiceLineId_idx" ON "PaymentAllocation"("invoiceLineId");

ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeStructureLine" ADD CONSTRAINT "FeeStructureLine_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructureLine" ADD CONSTRAINT "FeeStructureLine_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
