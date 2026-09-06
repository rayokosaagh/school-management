-- How often a fee is charged belongs to the fee type, not to each class's line.
--
-- Held per line, "Admission" could be one-time for one grade and monthly for
-- another — not a thing a school charges, and impossible to express in a
-- matrix where a fee type is one column across every class.
--
-- Reversing this migration: re-add "frequency" to "FeeStructureLine", backfill
-- it from the head each line points at, then drop the column added here.

ALTER TABLE "FeeHead" ADD COLUMN "frequency" "FeeFrequency" NOT NULL DEFAULT 'ONE_TIME';

-- Carry across what the existing lines already say. DISTINCT ON picks one row
-- per head; today no head is used at two different frequencies, and after this
-- migration it cannot be.
UPDATE "FeeHead" fh
SET "frequency" = sub."frequency"
FROM (
  SELECT DISTINCT ON ("feeHeadId") "feeHeadId", "frequency"
  FROM "FeeStructureLine"
  ORDER BY "feeHeadId", "id"
) sub
WHERE fh.id = sub."feeHeadId";

ALTER TABLE "FeeStructureLine" DROP COLUMN "frequency";
