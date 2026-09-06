-- Monthly fee instalments.
--
-- Before this, a school billing monthly had to invent a fee type per month
-- ("Bhadra Fee", then "Ashoj Fee"...) because FeeStructureLine.frequency was
-- written but never read. An invoice now records which instalment it is, so
-- one MONTHLY line can be billed twelve times.
--
-- Reversing this migration: drop the new index, restore the old one, set
-- periodMonth back to 0, rename the fee head back and set its lines to
-- ONE_TIME. No row is deleted here and no payment is touched.

-- 0 rather than NULL: this column joins the unique index below, and Postgres
-- treats each NULL there as distinct, which would stop the index blocking
-- duplicate one-time invoices.
ALTER TABLE "Invoice" ADD COLUMN "periodMonth" INTEGER NOT NULL DEFAULT 0;

-- The hand-made "Bhadra Fee" bills become Bhadra (month 5) instalments.
UPDATE "Invoice" i
SET "periodMonth" = 5
WHERE EXISTS (
  SELECT 1
  FROM "InvoiceLine" il
  JOIN "FeeHead" fh ON fh.id = il."feeHeadId"
  WHERE il."invoiceId" = i.id AND fh.name = 'Bhadra Fee'
);

-- ...and the type behind them becomes the reusable monthly one.
UPDATE "FeeStructureLine" fsl
SET "frequency" = 'MONTHLY'
WHERE EXISTS (
  SELECT 1 FROM "FeeHead" fh WHERE fh.id = fsl."feeHeadId" AND fh.name = 'Bhadra Fee'
);

UPDATE "FeeHead" SET name = 'Monthly Fee' WHERE name = 'Bhadra Fee';

-- One bill per enrolment per plan per instalment. The old two-column guard
-- would have rejected the second month.
DROP INDEX "Invoice_enrollmentId_feeStructureId_key";
CREATE UNIQUE INDEX "Invoice_enrollmentId_feeStructureId_periodMonth_key"
  ON "Invoice"("enrollmentId", "feeStructureId", "periodMonth");
