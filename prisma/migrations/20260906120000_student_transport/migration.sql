-- Additive migration: existing plans, invoice lines and payments are retained.
CREATE TYPE "FeeBillingScope" AS ENUM ('CLASS', 'TRANSPORT');
ALTER TABLE "FeeHead" ADD COLUMN "billingScope" "FeeBillingScope" NOT NULL DEFAULT 'CLASS';

-- Existing transport fees must no longer be included in class-wide billing.
UPDATE "FeeHead" SET "billingScope" = 'TRANSPORT'
WHERE lower(trim("name")) IN ('transport', 'transportation', 'transport fee', 'transportation fee', 'bus fee', 'school bus', 'school transport');

CREATE TABLE "TransportRegistration" (
  "id" SERIAL NOT NULL,
  "enrollmentId" INTEGER NOT NULL,
  "pickupLocation" TEXT NOT NULL,
  "monthlyAmount" INTEGER NOT NULL,
  "startMonth" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportRegistration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransportRegistration_price_check" CHECK ("monthlyAmount" > 0),
  CONSTRAINT "TransportRegistration_month_check" CHECK ("startMonth" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "TransportRegistration_enrollmentId_key" ON "TransportRegistration"("enrollmentId");
ALTER TABLE "TransportRegistration" ADD CONSTRAINT "TransportRegistration_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD COLUMN "transportRegistrationId" INTEGER;
CREATE UNIQUE INDEX "Invoice_transportRegistrationId_periodMonth_key" ON "Invoice"("transportRegistrationId", "periodMonth");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transportRegistrationId_fkey" FOREIGN KEY ("transportRegistrationId") REFERENCES "TransportRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
