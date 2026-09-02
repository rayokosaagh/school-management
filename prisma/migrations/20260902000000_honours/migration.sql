-- Conduct and activity records: the two honours pillars nothing recorded
-- before. Both cascade from the student like guardians do — a student who
-- leaves is marked LEFT, so the cascade only fires on the hard delete that is
-- already reserved for records entered by mistake.
CREATE TYPE "ConductKind" AS ENUM ('MERIT', 'DEMERIT');
CREATE TYPE "ActivityLevel" AS ENUM ('PARTICIPATED', 'PLACED', 'WON');

CREATE TABLE "ConductEntry" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "kind" "ConductKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductEntry_pkey" PRIMARY KEY ("id"),
    -- The sign lives in "kind"; a zero or negative entry would be a no-op or a
    -- contradiction.
    CONSTRAINT "ConductEntry_points_check" CHECK ("points" > 0)
);

CREATE INDEX "ConductEntry_studentId_academicYearId_idx"
    ON "ConductEntry"("studentId", "academicYearId");

ALTER TABLE "ConductEntry" ADD CONSTRAINT "ConductEntry_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConductEntry" ADD CONSTRAINT "ConductEntry_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Who recorded it is provenance, not ownership: removing the login keeps the entry.
ALTER TABLE "ConductEntry" ADD CONSTRAINT "ConductEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ActivityEntry" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ActivityLevel" NOT NULL,
    "points" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActivityEntry_points_check" CHECK ("points" > 0)
);

CREATE INDEX "ActivityEntry_studentId_academicYearId_idx"
    ON "ActivityEntry"("studentId", "academicYearId");

ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- How the honours score is weighted. Defaults are the spec's 50/20/15/15; the
-- service layer refuses a set that does not sum to 100.
ALTER TABLE "SchoolProfile"
    ADD COLUMN "weightExams" INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN "weightAttendance" INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN "weightConduct" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "weightActivities" INTEGER NOT NULL DEFAULT 15;
