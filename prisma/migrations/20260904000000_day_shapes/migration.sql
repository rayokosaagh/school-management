-- Day shapes: a school day can now be one of several named shapes ("Regular
-- day", "Half day"), assigned per weekday. Periods move from belonging to the
-- school outright to belonging to a shape, and gain a kind (teaching, break,
-- event) in place of the old isBreak flag.
--
-- This is not a pure structural change: the live database already has 8
-- SchoolPeriod rows with real TimetablePeriod lessons hanging off them. They
-- must land on a shape and get a kind before isBreak disappears, so the
-- statements below are ordered create-shape, add-columns-nullable, backfill,
-- then tighten-and-drop — never a moment where a row's shape or kind is
-- ambiguous, and never a NOT NULL added before every row already has a value.

CREATE TYPE "PeriodKind" AS ENUM ('TEACHING', 'BREAK', 'EVENT');

-- CreateTable
CREATE TABLE "DayShape" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DayShape_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DayShape_name_key" ON "DayShape"("name");

-- CreateTable
CREATE TABLE "WeekdayShape" (
    "dayOfWeek" INTEGER NOT NULL,
    "dayShapeId" INTEGER NOT NULL,

    CONSTRAINT "WeekdayShape_pkey" PRIMARY KEY ("dayOfWeek")
);

ALTER TABLE "WeekdayShape" ADD CONSTRAINT "WeekdayShape_dayShapeId_fkey"
    FOREIGN KEY ("dayShapeId") REFERENCES "DayShape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The shape every existing period, and every weekday with nothing else
-- assigned, falls back to. No WeekdayShape rows are inserted: absence already
-- means "use the default", so every working day keeps running exactly the
-- schedule it runs today.
INSERT INTO "DayShape" ("name", "isDefault") VALUES ('Regular day', true);

-- Add the new SchoolPeriod columns nullable-or-defaulted first, so the table
-- is never in a state where a row is missing a value it needs.
ALTER TABLE "SchoolPeriod"
    ADD COLUMN "dayShapeId" INTEGER,
    ADD COLUMN "kind" "PeriodKind" NOT NULL DEFAULT 'TEACHING',
    ADD COLUMN "label" TEXT NOT NULL DEFAULT '';

-- Backfill: every existing period is on "Regular day", and kind is derived
-- from isBreak while that column still exists to read from.
UPDATE "SchoolPeriod" SET "dayShapeId" = (SELECT "id" FROM "DayShape" WHERE "name" = 'Regular day');
UPDATE "SchoolPeriod" SET "kind" = 'BREAK' WHERE "isBreak" = true;

-- Now that every row has a shape, tighten the column and drop the flag it
-- replaces.
ALTER TABLE "SchoolPeriod" ALTER COLUMN "dayShapeId" SET NOT NULL;
ALTER TABLE "SchoolPeriod" DROP COLUMN "isBreak";

-- order was globally unique-ish (enforced by an index, not a constraint);
-- it is now unique per shape, so two shapes can each have a "Period 1".
DROP INDEX "SchoolPeriod_order_idx";
CREATE UNIQUE INDEX "SchoolPeriod_dayShapeId_order_key" ON "SchoolPeriod"("dayShapeId", "order");

ALTER TABLE "SchoolPeriod" ADD CONSTRAINT "SchoolPeriod_dayShapeId_fkey"
    FOREIGN KEY ("dayShapeId") REFERENCES "DayShape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
