-- CreateTable
CREATE TABLE "TimetablePeriod" (
    "id" SERIAL NOT NULL,
    "teacherAssignmentId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "room" TEXT NOT NULL,

    CONSTRAINT "TimetablePeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TimetablePeriod_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
    CONSTRAINT "TimetablePeriod_startMinute_check" CHECK ("startMinute" BETWEEN 0 AND 1439),
    CONSTRAINT "TimetablePeriod_endMinute_check" CHECK ("endMinute" BETWEEN 1 AND 1440),
    CONSTRAINT "TimetablePeriod_order_check" CHECK ("startMinute" < "endMinute")
);

-- CreateIndex
CREATE INDEX "TimetablePeriod_dayOfWeek_startMinute_idx" ON "TimetablePeriod"("dayOfWeek", "startMinute");

-- CreateIndex
CREATE UNIQUE INDEX "TimetablePeriod_teacherAssignmentId_dayOfWeek_startMinute_key" ON "TimetablePeriod"("teacherAssignmentId", "dayOfWeek", "startMinute");

-- AddForeignKey
ALTER TABLE "TimetablePeriod" ADD CONSTRAINT "TimetablePeriod_teacherAssignmentId_fkey" FOREIGN KEY ("teacherAssignmentId") REFERENCES "TeacherAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
