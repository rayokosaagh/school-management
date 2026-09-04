import { afterAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createAcademicYear } from "./academic-year";
import { createGrade, createSection } from "./structure";
import { createStaff } from "./staff";
import { createStudent } from "./students";
import { createOffering, createSubject } from "./subjects";
import { setSubjectTeacher } from "./assignments";
import { createExamTerm } from "@/lib/assessment/exams";
import { saveSheet } from "@/lib/attendance/attendance";
import { addActivity, addConduct } from "@/lib/honours/entries";
import { deleteYearWithData, PAYLOAD_VERSION } from "./year-teardown";
import { deleteRestorePoint, listRestorePoints, restoreYear, RestoreError } from "./restore-point";

// Talks to the real database. Builds its own fixture year, deletes it through
// the real teardown path to get a real restore point, then restores it — the
// only way to prove the round trip without duplicating snapshotYear's logic.
const made = {
  yearId: 0,
  gradeAId: 0,
  gradeBId: 0,
  staffTeacherId: 0,
  staffLeavingId: 0,
  subjectId: 0,
  offeringId: 0,
  sectionAId: 0,
  sectionBId: 0,
  schoolPeriodId: 0,
  keepStudentIds: [] as number[],
  keepEnrollmentId: 0,
  goneStudentId: 0,
  examTermId: 0,
  attendanceSessionId: 0,
  restorePointId: 0,
  fakeRestorePointId: 0,
  /// A second, independent fixture year — built only to prove restoreYear
  /// inserts with createMany rather than one row at a time.
  bulkYearId: 0,
  bulkGradeId: 0,
  bulkSectionId: 0,
  bulkStudentIds: [] as number[],
  bulkRestorePointId: 0,
};

const YEAR = "2095";
const BULK_YEAR = "2096";
const stamp = Date.now() % 100000;

afterAll(async () => {
  if (made.fakeRestorePointId) {
    await prisma.restorePoint.deleteMany({ where: { id: made.fakeRestorePointId } });
  }
  if (made.restorePointId) {
    await prisma.restorePoint.deleteMany({ where: { id: made.restorePointId } });
  }
  // The restored year is dormant (isCurrent: false), so deleteYearWithData can
  // walk it exactly like any other year — the same cleanup this suite is testing.
  const stillThere = await prisma.academicYear.findUnique({ where: { id: made.yearId } });
  if (stillThere) {
    await deleteYearWithData(made.yearId, { createRestorePoint: false, actorUserId: null });
  }
  if (made.bulkRestorePointId) {
    await prisma.restorePoint.deleteMany({ where: { id: made.bulkRestorePointId } });
  }
  const bulkStillThere = await prisma.academicYear.findUnique({ where: { id: made.bulkYearId } });
  if (bulkStillThere) {
    await deleteYearWithData(made.bulkYearId, { createRestorePoint: false, actorUserId: null });
  }
  await prisma.student.deleteMany({ where: { id: { in: made.bulkStudentIds } } });
  if (made.bulkSectionId) await prisma.section.deleteMany({ where: { id: made.bulkSectionId } });
  if (made.bulkGradeId) await prisma.grade.deleteMany({ where: { id: made.bulkGradeId } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.keepStudentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.keepStudentIds } } });
  // goneStudentId was deleted mid-suite to simulate the skip; harmless if so.
  await prisma.student.deleteMany({ where: { id: made.goneStudentId } });
  if (made.offeringId) await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  if (made.subjectId) await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  if (made.schoolPeriodId) await prisma.schoolPeriod.deleteMany({ where: { id: made.schoolPeriodId } });
  await prisma.section.deleteMany({ where: { id: { in: [made.sectionAId, made.sectionBId] } } });
  await prisma.grade.deleteMany({ where: { id: { in: [made.gradeAId, made.gradeBId] } } });
  // staffLeavingId was deleted mid-suite; harmless if so.
  await prisma.staff.deleteMany({ where: { id: made.staffLeavingId } });
  if (made.staffTeacherId) await prisma.staff.deleteMany({ where: { id: made.staffTeacherId } });
  await prisma.$disconnect();
});

// Needs a live database, so it is opt-in: DB_TESTS=1 npx vitest run
describe.skipIf(!process.env.DB_TESTS)("restore-point: restore a year", () => {
  it("builds a fixture year holding every record type, then tears it down into a restore point", async () => {
    const year = await createAcademicYear({ nameBS: YEAR });
    made.yearId = year.id;

    const gradeA = await createGrade({ name: `__restore Grade A ${stamp}`, order: 89501 + stamp });
    const gradeB = await createGrade({ name: `__restore Grade B ${stamp}`, order: 89502 + stamp });
    made.gradeAId = gradeA.id;
    made.gradeBId = gradeB.id;

    const sectionA = await createSection({ name: "A", gradeId: gradeA.id, academicYearId: year.id });
    const sectionB = await createSection({ name: "B", gradeId: gradeB.id, academicYearId: year.id });
    made.sectionAId = sectionA.id;
    made.sectionBId = sectionB.id;

    const staffTeacher = await createStaff({
      firstName: "__restore",
      middleName: "Bimal",
      lastName: "Karki",
      phone: "9800000011",
      designation: "Teacher",
      joinedOn: new Date(Date.UTC(2020, 3, 14)),
    });
    made.staffTeacherId = staffTeacher.id;

    // This one is the section's class teacher, and will be deleted before the
    // restore — proving the section comes back with the reference nulled
    // rather than being skipped outright.
    const staffLeaving = await createStaff({
      firstName: "__restore",
      middleName: "Kamal",
      lastName: "Gurung",
      phone: "9800000012",
      designation: "Teacher",
      joinedOn: new Date(Date.UTC(2019, 3, 14)),
    });
    made.staffLeavingId = staffLeaving.id;
    await prisma.section.update({ where: { id: sectionA.id }, data: { classTeacherId: staffLeaving.id } });

    const subject = await createSubject({ name: `__restore Subject ${stamp}` });
    made.subjectId = subject.id;

    const offering = await createOffering({
      subjectId: subject.id,
      gradeId: gradeA.id,
      academicYearId: year.id,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    });
    made.offeringId = offering.id;

    const assignment = await setSubjectTeacher(sectionA.id, offering.id, staffTeacher.id);
    if (!assignment) throw new Error("expected an assignment to be created");

    // SchoolPeriod now belongs to a DayShape (see day-shapes.ts) rather than
    // to the school outright — attached to the default shape here.
    const defaultShape = await prisma.dayShape.findFirstOrThrow({ where: { isDefault: true } });
    const period = await prisma.schoolPeriod.create({
      data: {
        order: 9501 + stamp,
        name: `__restore Period ${stamp}`,
        startMinute: 600,
        endMinute: 645,
        dayShapeId: defaultShape.id,
      },
    });
    made.schoolPeriodId = period.id;
    await prisma.timetablePeriod.create({
      data: {
        teacherAssignmentId: assignment.id,
        sectionId: sectionA.id,
        schoolPeriodId: period.id,
        dayOfWeek: 0,
      },
    });

    const base = {
      dob: new Date(Date.UTC(2012, 5, 1)),
      admittedOn: year.startsOn,
      gender: "MALE" as const,
      enrollment: { sectionId: sectionA.id, academicYearId: year.id },
    };
    const keep1 = await createStudent({
      ...base,
      admissionNo: `__restore-${stamp}-1`,
      firstName: "__restore",
      middleName: "Anish",
      lastName: "Thapa",
      guardians: [{ relation: "FATHER", fullName: "Ram Thapa", phone: "9811111121", isPrimary: true }],
    });
    const keep2 = await createStudent({
      ...base,
      admissionNo: `__restore-${stamp}-2`,
      firstName: "__restore",
      middleName: "Bina",
      lastName: "Rai",
      gender: "FEMALE",
      guardians: [{ relation: "MOTHER", fullName: "Gita Rai", phone: "9822222221", isPrimary: true }],
    });
    // This one is deleted between the snapshot and the restore — the row a
    // skip has to name.
    const gone = await createStudent({
      ...base,
      admissionNo: `__restore-${stamp}-3`,
      firstName: "__restore",
      middleName: "Suresh",
      lastName: "Basnet",
      guardians: [{ relation: "FATHER", fullName: "Hari Basnet", phone: "9833333321", isPrimary: true }],
    });
    made.keepStudentIds.push(keep1.id, keep2.id);
    made.goneStudentId = gone.id;

    const keepEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: keep1.id, academicYearId: year.id },
      select: { id: true },
    });
    if (!keepEnrollment) throw new Error("expected the fixture enrolment to exist");
    made.keepEnrollmentId = keepEnrollment.id;

    const examTerm = await createExamTerm({ academicYearId: year.id, name: "First Terminal" });
    made.examTermId = examTerm.id;
    for (const student of [keep1, keep2, gone]) {
      await prisma.mark.create({
        data: { examTermId: examTerm.id, studentId: student.id, subjectOfferingId: offering.id, theory: 55 },
      });
    }

    const session = await saveSheet({
      sectionId: sectionA.id,
      date: year.startsOn,
      takenById: staffTeacher.id,
      entries: [
        { studentId: keep1.id, status: "PRESENT" },
        { studentId: keep2.id, status: "ABSENT" },
        { studentId: gone.id, status: "PRESENT" },
      ],
    });
    made.attendanceSessionId = session.id;

    await addConduct({
      studentId: keep1.id,
      academicYearId: year.id,
      kind: "MERIT",
      points: 5,
      date: year.startsOn,
      note: "Helped organise the library.",
      recordedById: null,
    });
    await addActivity({
      studentId: keep1.id,
      academicYearId: year.id,
      name: "Inter-school quiz",
      level: "PARTICIPATED",
      points: 5,
      date: year.startsOn,
      recordedById: null,
    });

    const result = await deleteYearWithData(year.id, { createRestorePoint: true, actorUserId: null });
    made.restorePointId = result.restorePointId ?? 0;
    expect(made.restorePointId).toBeGreaterThan(0);
    expect(await prisma.academicYear.findUnique({ where: { id: year.id } })).toBeNull();
  });

  it("skips a student deleted since the snapshot, nulls a missing class teacher, and restores everything else", async () => {
    // Simulate real-world drift between the delete and the restore: one
    // student and one staff member are gone by the time anyone restores.
    await prisma.student.delete({ where: { id: made.goneStudentId } });
    await prisma.staff.delete({ where: { id: made.staffLeavingId } });

    const report = await restoreYear(made.restorePointId);

    expect(report.yearNameBS).toBe(YEAR);
    expect(report.tables.sections).toEqual({ restored: 2, skipped: 0 });
    expect(report.tables.offerings).toEqual({ restored: 1, skipped: 0 });
    expect(report.tables.assignments).toEqual({ restored: 1, skipped: 0 });
    expect(report.tables.periods).toEqual({ restored: 1, skipped: 0 });
    expect(report.tables.enrollments).toEqual({
      restored: 2,
      skipped: 1,
      reason: "1 skipped — those students no longer exist",
    });
    expect(report.tables.examTerms).toEqual({ restored: 1, skipped: 0 });
    expect(report.tables.marks).toEqual({
      restored: 2,
      skipped: 1,
      reason: "1 skipped — those students no longer exist",
    });
    expect(report.tables.attendanceSessions).toEqual({ restored: 1, skipped: 0 });
    expect(report.tables.attendanceRecords).toEqual({
      restored: 2,
      skipped: 1,
      reason: "1 skipped — those students no longer exist",
    });
    expect(report.tables.conduct).toEqual({ restored: 1, skipped: 0 });
    expect(report.tables.activities).toEqual({ restored: 1, skipped: 0 });

    // The year is back, but dormant.
    const year = await prisma.academicYear.findUnique({ where: { id: made.yearId } });
    expect(year).not.toBeNull();
    expect(year?.nameBS).toBe(YEAR);
    expect(year?.isCurrent).toBe(false);

    // Original ids resolved without remapping.
    const sectionA = await prisma.section.findUnique({ where: { id: made.sectionAId } });
    expect(sectionA).not.toBeNull();
    expect(sectionA?.gradeId).toBe(made.gradeAId);
    // The class teacher is gone: the section still came back, just without one.
    expect(sectionA?.classTeacherId).toBeNull();

    const keepEnrollment = await prisma.enrollment.findUnique({ where: { id: made.keepEnrollmentId } });
    expect(keepEnrollment).not.toBeNull();
    expect(keepEnrollment?.sectionId).toBe(made.sectionAId);

    // The deleted student really did lose its rows, not just get skipped by
    // the report — nothing in this year still points at it.
    expect(await prisma.enrollment.count({ where: { studentId: made.goneStudentId } })).toBe(0);
    expect(await prisma.mark.count({ where: { studentId: made.goneStudentId } })).toBe(0);
    expect(await prisma.attendanceRecord.count({ where: { studentId: made.goneStudentId } })).toBe(0);
  });

  it("leaves the restore point in place after a successful restore", async () => {
    const restorePoint = await prisma.restorePoint.findUnique({ where: { id: made.restorePointId } });
    expect(restorePoint).not.toBeNull();

    const list = await listRestorePoints();
    const row = list.find((r) => r.id === made.restorePointId);
    expect(row).toBeDefined();
    expect(row?.yearNameBS).toBe(YEAR);
    expect(row?.payloadBytes).toBeGreaterThan(0);
  });

  it("refuses to restore into a year name that already exists, writing nothing", async () => {
    const sectionsBefore = await prisma.section.count({ where: { academicYearId: made.yearId } });
    const enrollmentsBefore = await prisma.enrollment.count({ where: { academicYearId: made.yearId } });

    // The year from the previous test is still there, so restoring the same
    // point again collides with it.
    await expect(restoreYear(made.restorePointId)).rejects.toThrow(RestoreError);
    await expect(restoreYear(made.restorePointId)).rejects.toThrow(YEAR);

    expect(await prisma.section.count({ where: { academicYearId: made.yearId } })).toBe(sectionsBefore);
    expect(await prisma.enrollment.count({ where: { academicYearId: made.yearId } })).toBe(enrollmentsBefore);
  });

  it("refuses a payload whose version does not match, naming both versions", async () => {
    const fakeYearName = `__restore-fake-${stamp}`;
    const badVersion = PAYLOAD_VERSION + 1;
    const badPayload = {
      version: badVersion,
      year: {
        id: -999999,
        nameBS: fakeYearName,
        startsOn: "2020-01-01T00:00:00.000Z",
        endsOn: "2020-12-31T00:00:00.000Z",
      },
      sections: [], offerings: [], assignments: [], periods: [], enrollments: [],
      examTerms: [], marks: [], attendanceSessions: [], attendanceRecords: [], conduct: [], activities: [],
    };
    const zeroCounts = {
      sections: 0, offerings: 0, assignments: 0, periods: 0, enrollments: 0,
      examTerms: 0, marks: 0, attendanceSessions: 0, attendanceRecords: 0, conduct: 0, activities: 0,
    };

    const fakePoint = await prisma.restorePoint.create({
      data: {
        yearNameBS: fakeYearName,
        startsOn: new Date("2020-01-01"),
        endsOn: new Date("2020-12-31"),
        createdById: null,
        counts: zeroCounts,
        payload: badPayload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    made.fakeRestorePointId = fakePoint.id;

    await expect(restoreYear(fakePoint.id)).rejects.toThrow(RestoreError);
    await expect(restoreYear(fakePoint.id)).rejects.toThrow(String(badVersion));
    await expect(restoreYear(fakePoint.id)).rejects.toThrow(String(PAYLOAD_VERSION));
    expect(await prisma.academicYear.findUnique({ where: { nameBS: fakeYearName } })).toBeNull();
  });

  it("refuses to restore a restore point that does not exist", async () => {
    await expect(restoreYear(-1)).rejects.toThrow(RestoreError);
  });

  it(
    "restores a few hundred attendance records through the bulk-insert path",
    async () => {
      // Large enough that the old one-row-at-a-time restore would need
      // hundreds of sequential round trips for this table alone — small
      // enough to keep the suite fast. Proves createMany is actually taken,
      // not just that a handful of rows happen to survive.
      const STUDENT_COUNT = 20;
      const SESSION_COUNT = 15;

      const year = await createAcademicYear({ nameBS: BULK_YEAR });
      made.bulkYearId = year.id;
      const grade = await createGrade({ name: `__bulk Grade ${stamp}`, order: 89601 + stamp });
      made.bulkGradeId = grade.id;
      const section = await createSection({ name: "A", gradeId: grade.id, academicYearId: year.id });
      made.bulkSectionId = section.id;

      const students = await prisma.student.createManyAndReturn({
        data: Array.from({ length: STUDENT_COUNT }, (_, i) => ({
          admissionNo: `__bulk-${stamp}-${i}`,
          firstName: "__bulk",
          lastName: `Student${i}`,
          fullName: `__bulk Student${i}`,
          dob: new Date(Date.UTC(2012, 5, 1)),
          gender: "MALE" as const,
          admittedOn: year.startsOn,
        })),
        select: { id: true },
      });
      made.bulkStudentIds = students.map((s) => s.id);

      await prisma.enrollment.createMany({
        data: made.bulkStudentIds.map((studentId, i) => ({
          studentId,
          sectionId: section.id,
          academicYearId: year.id,
          rollNo: i + 1,
          enrolledOn: year.startsOn,
        })),
      });

      const sessions = await prisma.attendanceSession.createManyAndReturn({
        data: Array.from({ length: SESSION_COUNT }, (_, i) => ({
          sectionId: section.id,
          academicYearId: year.id,
          date: new Date(year.startsOn.getTime() + i * 86_400_000),
        })),
        select: { id: true },
      });

      await prisma.attendanceRecord.createMany({
        data: sessions.flatMap((session) =>
          made.bulkStudentIds.map((studentId) => ({
            sessionId: session.id,
            studentId,
            status: "PRESENT" as const,
          })),
        ),
      });

      const recordTotal = STUDENT_COUNT * SESSION_COUNT;
      expect(
        await prisma.attendanceRecord.count({ where: { sessionId: { in: sessions.map((s) => s.id) } } }),
      ).toBe(recordTotal);

      const result = await deleteYearWithData(year.id, { createRestorePoint: true, actorUserId: null });
      made.bulkRestorePointId = result.restorePointId ?? 0;
      expect(made.bulkRestorePointId).toBeGreaterThan(0);
      expect(result.counts.attendanceRecords).toBe(recordTotal);
      expect(result.counts.attendanceSessions).toBe(SESSION_COUNT);
      expect(result.counts.enrollments).toBe(STUDENT_COUNT);

      const report = await restoreYear(made.bulkRestorePointId);

      // Every one of them came back — the point of this test.
      expect(report.tables.attendanceRecords).toEqual({ restored: recordTotal, skipped: 0 });
      expect(report.tables.attendanceSessions).toEqual({ restored: SESSION_COUNT, skipped: 0 });
      expect(report.tables.enrollments).toEqual({ restored: STUDENT_COUNT, skipped: 0 });

      // Not just the report's own count — the rows are actually there.
      expect(
        await prisma.attendanceRecord.count({ where: { studentId: { in: made.bulkStudentIds } } }),
      ).toBe(recordTotal);
      expect(
        await prisma.attendanceSession.count({ where: { academicYearId: made.bulkYearId } }),
      ).toBe(SESSION_COUNT);
      expect(
        await prisma.enrollment.count({ where: { academicYearId: made.bulkYearId } }),
      ).toBe(STUDENT_COUNT);
    },
    30_000,
  );

  it("deletes a restore point as a plain delete", async () => {
    // A throwaway point of its own, so the earlier tests' restore point is
    // left alone for afterAll's cleanup.
    const throwaway = await prisma.restorePoint.create({
      data: {
        yearNameBS: `__restore-throwaway-${stamp}`,
        startsOn: new Date("2020-01-01"),
        endsOn: new Date("2020-12-31"),
        createdById: null,
        counts: {
          sections: 0, offerings: 0, assignments: 0, periods: 0, enrollments: 0,
          examTerms: 0, marks: 0, attendanceSessions: 0, attendanceRecords: 0, conduct: 0, activities: 0,
        },
        payload: { version: PAYLOAD_VERSION } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await deleteRestorePoint(throwaway.id);

    expect(await prisma.restorePoint.findUnique({ where: { id: throwaway.id } })).toBeNull();
  });
});
