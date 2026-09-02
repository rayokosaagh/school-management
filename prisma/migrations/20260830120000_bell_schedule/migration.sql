-- The bell schedule the weekly grid is built from. `order` is not unique, so
-- the whole schedule can be renumbered in one transaction; contiguity is
-- enforced in the service layer.
CREATE TABLE "SchoolPeriod" (
    "id" SERIAL NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SchoolPeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolPeriod_startMinute_check" CHECK ("startMinute" BETWEEN 0 AND 1439),
    CONSTRAINT "SchoolPeriod_endMinute_check" CHECK ("endMinute" BETWEEN 1 AND 1440),
    CONSTRAINT "SchoolPeriod_order_check" CHECK ("startMinute" < "endMinute")
);

CREATE INDEX "SchoolPeriod_order_idx" ON "SchoolPeriod"("order");

-- Which weekdays the school runs. Sunday = 0; Saturday is the weekly holiday.
ALTER TABLE "SchoolProfile"
    ADD COLUMN "workingDays" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5];

-- TimetablePeriod moves from storing its own wall-clock times to referencing a
-- bell period, and carries its section so one-lesson-per-slot can be a real
-- constraint. The table is empty in every environment, so no backfill is needed.
DROP INDEX "TimetablePeriod_dayOfWeek_startMinute_idx";
DROP INDEX "TimetablePeriod_teacherAssignmentId_dayOfWeek_startMinute_key";

ALTER TABLE "TimetablePeriod"
    DROP CONSTRAINT "TimetablePeriod_startMinute_check",
    DROP CONSTRAINT "TimetablePeriod_endMinute_check",
    DROP CONSTRAINT "TimetablePeriod_order_check",
    DROP COLUMN "startMinute",
    DROP COLUMN "endMinute",
    ADD COLUMN "sectionId" INTEGER NOT NULL,
    ADD COLUMN "schoolPeriodId" INTEGER NOT NULL,
    ALTER COLUMN "room" SET DEFAULT '';

CREATE INDEX "TimetablePeriod_dayOfWeek_idx" ON "TimetablePeriod"("dayOfWeek");

-- The rule that matters: a section is in exactly one lesson at a time.
CREATE UNIQUE INDEX "TimetablePeriod_sectionId_dayOfWeek_schoolPeriodId_key"
    ON "TimetablePeriod"("sectionId", "dayOfWeek", "schoolPeriodId");

CREATE UNIQUE INDEX "TimetablePeriod_teacherAssignmentId_dayOfWeek_schoolPeriod_key"
    ON "TimetablePeriod"("teacherAssignmentId", "dayOfWeek", "schoolPeriodId");

ALTER TABLE "TimetablePeriod" ADD CONSTRAINT "TimetablePeriod_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascades on purpose: deleting a bell period deletes its lessons. The School
-- day form counts and confirms that before it lets anyone remove a row.
ALTER TABLE "TimetablePeriod" ADD CONSTRAINT "TimetablePeriod_schoolPeriodId_fkey"
    FOREIGN KEY ("schoolPeriodId") REFERENCES "SchoolPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
