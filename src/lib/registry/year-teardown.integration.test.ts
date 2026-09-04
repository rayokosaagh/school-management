import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createAcademicYear, setCurrentAcademicYear } from "./academic-year";
import { createGrade, createSection } from "./structure";
import { createStaff } from "./staff";
import { createStudent } from "./students";
import { createOffering, createSubject } from "./subjects";
import { setSubjectTeacher } from "./assignments";
import { createExamTerm } from "@/lib/assessment/exams";
import { saveSheet } from "@/lib/attendance/attendance";
import { addActivity, addConduct } from "@/lib/honours/entries";
import {
  deleteYearWithData,
  snapshotYear,
  summariseYear,
  YearTeardownError,
  PAYLOAD_VERSION,
} from "./year-teardown";

// Talks to the real database. Everything it makes is torn down afterwards, and
// it touches nothing it did not create.
const made = {
  yearId: 0,
  bareYearId: 0,
  emptyYearId: 0,
  gradeIds: [] as number[],
  sectionIds: [] as number[],
  bareSectionId: 0,
  staffId: 0,
  subjectId: 0,
  offeringId: 0,
  bareOfferingId: 0,
  studentIds: [] as number[],
  examTermId: 0,
  attendanceSessionId: 0,
  /// SchoolPeriod is global, not year-scoped, so nothing else removes it — a
  /// run that forgets leaves an orphan period showing in the real timetable.
  schoolPeriodId: 0,
  /// Set once the delete test captures a restore point, so afterAll can clean
  /// up a row the module itself created.
  restorePointId: 0,
  /// The year the school had marked current before this suite hijacked it.
  previousCurrentYearId: null as number | null,
};

const YEAR = "2087";
const BARE_YEAR = "2088";
const GUARD_YEAR = "2089";
const EMPTY_YEAR = "2090";
const stamp = Date.now() % 100000;

afterAll(async () => {
  if (made.restorePointId) {
    await prisma.restorePoint.deleteMany({ where: { id: made.restorePointId } });
  }
  await prisma.activityEntry.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.conductEntry.deleteMany({ where: { studentId: { in: made.studentIds } } });
  if (made.attendanceSessionId) {
    // AttendanceRecord cascades from its session.
    await prisma.attendanceSession.deleteMany({ where: { id: made.attendanceSessionId } });
  }
  if (made.examTermId) {
    // Mark cascades from its exam term.
    await prisma.examTerm.deleteMany({ where: { id: made.examTermId } });
  }
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.studentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: made.studentIds } } });
  if (made.bareOfferingId) {
    await prisma.subjectOffering.deleteMany({ where: { id: made.bareOfferingId } });
  }
  if (made.offeringId) {
    // TeacherAssignment and TimetablePeriod cascade from the offering.
    await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  }
  if (made.subjectId) await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  // Global, so it outlives the year this suite deletes; TimetablePeriod
  // cascades from it and is already gone by here either way.
  if (made.schoolPeriodId) {
    await prisma.schoolPeriod.deleteMany({ where: { id: made.schoolPeriodId } });
  }
  if (made.bareSectionId) await prisma.section.deleteMany({ where: { id: made.bareSectionId } });
  if (made.sectionIds.length) {
    await prisma.section.deleteMany({ where: { id: { in: made.sectionIds } } });
  }
  if (made.gradeIds.length) {
    await prisma.grade.deleteMany({ where: { id: { in: made.gradeIds } } });
  }
  if (made.staffId) await prisma.staff.deleteMany({ where: { id: made.staffId } });
  if (made.emptyYearId) await prisma.academicYear.deleteMany({ where: { id: made.emptyYearId } });
  if (made.bareYearId) await prisma.academicYear.deleteMany({ where: { id: made.bareYearId } });
  if (made.yearId) await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  // Deleting the test years would otherwise leave the school with no current
  // year at all, which blanks every page.
  if (made.previousCurrentYearId !== null) {
    // Guarded: the year that was current may itself have been a fixture.
    const still = await prisma.academicYear.findUnique({
      where: { id: made.previousCurrentYearId },
      select: { id: true },
    });
    if (still) await setCurrentAcademicYear(made.previousCurrentYearId);
  }
  await prisma.$disconnect();
});

// Needs a live database, so it is opt-in: DB_TESTS=1 npx vitest run
describe.skipIf(!process.env.DB_TESTS)("year teardown: summarise and snapshot", () => {
  it("builds a fixture year holding every record type", async () => {
    const before = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    made.previousCurrentYearId = before?.id ?? null;

    const year = await createAcademicYear({ nameBS: YEAR });
    made.yearId = year.id;

    const gradeA = await createGrade({ name: `__teardown Grade A ${stamp}`, order: 88801 + stamp });
    const gradeB = await createGrade({ name: `__teardown Grade B ${stamp}`, order: 88802 + stamp });
    made.gradeIds.push(gradeA.id, gradeB.id);

    const sectionA = await createSection({ name: "A", gradeId: gradeA.id, academicYearId: year.id });
    const sectionB = await createSection({ name: "B", gradeId: gradeB.id, academicYearId: year.id });
    made.sectionIds.push(sectionA.id, sectionB.id);

    const staff = await createStaff({
      firstName: "__teardown",
      middleName: "Bimal",
      lastName: "Karki",
      phone: "9800000001",
      designation: "Teacher",
      joinedOn: new Date(Date.UTC(2020, 3, 14)),
    });
    made.staffId = staff.id;

    // One section carries a class teacher; the other does not.
    await prisma.section.update({ where: { id: sectionA.id }, data: { classTeacherId: staff.id } });

    const subject = await createSubject({ name: `__teardown Subject ${stamp}` });
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

    const assignment = await setSubjectTeacher(sectionA.id, offering.id, staff.id);
    if (!assignment) throw new Error("expected an assignment to be created");

    const period = await prisma.schoolPeriod.create({
      data: { order: 9001 + stamp, name: `__teardown Period ${stamp}`, startMinute: 600, endMinute: 645 },
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
    const first = await createStudent({
      ...base,
      admissionNo: `__teardown-${stamp}-1`,
      firstName: "__teardown",
      middleName: "Anish",
      lastName: "Thapa",
      guardians: [
        { relation: "FATHER", fullName: "Ram Thapa", phone: "9811111111", isPrimary: true },
      ],
    });
    const second = await createStudent({
      ...base,
      admissionNo: `__teardown-${stamp}-2`,
      firstName: "__teardown",
      middleName: "Bina",
      lastName: "Rai",
      gender: "FEMALE",
      guardians: [
        { relation: "MOTHER", fullName: "Gita Rai", phone: "9822222222", isPrimary: true },
      ],
    });
    made.studentIds.push(first.id, second.id);

    const examTerm = await createExamTerm({ academicYearId: year.id, name: "First Terminal" });
    made.examTermId = examTerm.id;
    await prisma.mark.create({
      data: { examTermId: examTerm.id, studentId: first.id, subjectOfferingId: offering.id, theory: 55 },
    });
    await prisma.mark.create({
      data: { examTermId: examTerm.id, studentId: second.id, subjectOfferingId: offering.id, theory: 62 },
    });

    const session = await saveSheet({
      sectionId: sectionA.id,
      date: year.startsOn,
      takenById: staff.id,
      entries: [
        { studentId: first.id, status: "PRESENT" },
        { studentId: second.id, status: "ABSENT" },
      ],
    });
    made.attendanceSessionId = session.id;

    await addConduct({
      studentId: first.id,
      academicYearId: year.id,
      kind: "MERIT",
      points: 5,
      date: year.startsOn,
      note: "Helped organise the library.",
      recordedById: null,
    });
    await addActivity({
      studentId: first.id,
      academicYearId: year.id,
      name: "Inter-school quiz",
      level: "PARTICIPATED",
      points: 5,
      date: year.startsOn,
      recordedById: null,
    });

    // A second, untaught year: only a section and an offering, nothing else.
    const bareYear = await createAcademicYear({ nameBS: BARE_YEAR });
    made.bareYearId = bareYear.id;
    const bareSection = await createSection({
      name: "A",
      gradeId: gradeA.id,
      academicYearId: bareYear.id,
    });
    made.bareSectionId = bareSection.id;
    const bareOffering = await createOffering({
      subjectId: subject.id,
      gradeId: gradeA.id,
      academicYearId: bareYear.id,
      hasPractical: false,
      fullMarksTheory: 100,
      passMarksTheory: 40,
    });
    made.bareOfferingId = bareOffering.id;

    expect(made.studentIds).toHaveLength(2);
  });

  it("counts every table exactly and reports the year as holding data", async () => {
    const summary = await summariseYear(made.yearId);

    expect(summary.year.nameBS).toBe(YEAR);
    expect(summary.counts).toEqual({
      sections: 2,
      offerings: 1,
      assignments: 1,
      periods: 1,
      enrollments: 2,
      examTerms: 1,
      marks: 2,
      attendanceSessions: 1,
      attendanceRecords: 2,
      conduct: 1,
      activities: 1,
    });
    expect(summary.hasData).toBe(true);
  });

  // The regression guard for the year-2084 incident: a year with only
  // structure — sections and enrolments, zero attendance and zero marks —
  // must still gate its delete behind a typed name. "taught" (attendance or
  // marks) used to be the only trigger, and this bare year sailed through a
  // single click, losing 14 sections, 91 offerings and 117 enrolments for
  // good.
  it("reports a year holding only sections and offerings — no attendance, no marks — as holding data", async () => {
    const summary = await summariseYear(made.bareYearId);

    expect(summary.counts.sections).toBe(1);
    expect(summary.counts.offerings).toBe(1);
    expect(summary.counts.attendanceSessions).toBe(0);
    expect(summary.counts.marks).toBe(0);
    expect(summary.hasData).toBe(true);
  });

  it("reports a genuinely empty year as holding no data", async () => {
    const emptyYear = await createAcademicYear({ nameBS: EMPTY_YEAR });
    made.emptyYearId = emptyYear.id;

    const summary = await summariseYear(emptyYear.id);

    expect(summary.counts).toEqual({
      sections: 0, offerings: 0, assignments: 0, periods: 0, enrollments: 0,
      examTerms: 0, marks: 0, attendanceSessions: 0, attendanceRecords: 0,
      conduct: 0, activities: 0,
    });
    expect(summary.hasData).toBe(false);
  });

  it("refuses to summarise a year that does not exist", async () => {
    await expect(summariseYear(-1)).rejects.toThrow(YearTeardownError);
  });

  it("snapshots every row the delete would remove, inside a transaction", async () => {
    const { payload, counts } = await prisma.$transaction((tx) => snapshotYear(tx, made.yearId));

    expect(payload.version).toBe(PAYLOAD_VERSION);
    expect(payload.year.nameBS).toBe(YEAR);
    expect(payload.sections).toHaveLength(counts.sections);
    expect(payload.offerings).toHaveLength(counts.offerings);
    expect(payload.assignments).toHaveLength(counts.assignments);
    expect(payload.periods).toHaveLength(counts.periods);
    expect(payload.enrollments).toHaveLength(counts.enrollments);
    expect(payload.examTerms).toHaveLength(counts.examTerms);
    expect(payload.marks).toHaveLength(counts.marks);
    expect(payload.attendanceSessions).toHaveLength(counts.attendanceSessions);
    expect(payload.attendanceRecords).toHaveLength(counts.attendanceRecords);
    expect(payload.conduct).toHaveLength(counts.conduct);
    expect(payload.activities).toHaveLength(counts.activities);

    // The snapshot's own counts agree exactly with what the fixture built.
    expect(counts).toEqual({
      sections: 2,
      offerings: 1,
      assignments: 1,
      periods: 1,
      enrollments: 2,
      examTerms: 1,
      marks: 2,
      attendanceSessions: 1,
      attendanceRecords: 2,
      conduct: 1,
      activities: 1,
    });
  });

  it("refuses to delete the current year, changing nothing", async () => {
    // A throwaway year of its own, so this test never has to touch the
    // current-ness of the other fixtures.
    const guardYear = await createAcademicYear({ nameBS: GUARD_YEAR });
    await setCurrentAcademicYear(guardYear.id);

    try {
      const yearsBefore = await prisma.academicYear.count();

      await expect(
        deleteYearWithData(guardYear.id, { createRestorePoint: true, actorUserId: null }),
      ).rejects.toThrow(YearTeardownError);

      // Not "probably unchanged" — counted, so a partial delete would show.
      expect(await prisma.academicYear.count()).toBe(yearsBefore);
      const stillThere = await prisma.academicYear.findUnique({ where: { id: guardYear.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.isCurrent).toBe(true);
      expect(await prisma.restorePoint.count({ where: { yearNameBS: GUARD_YEAR } })).toBe(0);
    } finally {
      // Hand the current flag back before it can block any later delete in
      // this suite.
      if (made.previousCurrentYearId) await setCurrentAcademicYear(made.previousCurrentYearId);
      await prisma.academicYear.deleteMany({ where: { id: guardYear.id } });
    }
  });

  it("refuses to delete a year that does not exist", async () => {
    await expect(
      deleteYearWithData(-1, { createRestorePoint: false, actorUserId: null }),
    ).rejects.toThrow(YearTeardownError);
  });

  it("deletes the taught fixture year, matches the prior summary, and leaves everything outside the year untouched", async () => {
    const statusesBefore = (
      await prisma.student.findMany({
        where: { id: { in: made.studentIds } },
        select: { id: true, status: true },
      })
    ).sort((a, b) => a.id - b.id);

    const summary = await summariseYear(made.yearId);
    const result = await deleteYearWithData(made.yearId, {
      createRestorePoint: true,
      actorUserId: null,
    });
    made.restorePointId = result.restorePointId ?? 0;

    // The delete's own counts are exactly what the summary promised moments
    // earlier — no drift between "what we said we'd remove" and "what we did".
    expect(result.counts).toEqual(summary.counts);

    // The year, and every row scoped to it, is gone.
    expect(await prisma.academicYear.findUnique({ where: { id: made.yearId } })).toBeNull();
    expect(await prisma.section.count({ where: { academicYearId: made.yearId } })).toBe(0);
    expect(await prisma.subjectOffering.count({ where: { academicYearId: made.yearId } })).toBe(0);
    expect(await prisma.enrollment.count({ where: { academicYearId: made.yearId } })).toBe(0);
    expect(await prisma.examTerm.count({ where: { academicYearId: made.yearId } })).toBe(0);
    expect(await prisma.attendanceSession.count({ where: { academicYearId: made.yearId } })).toBe(0);
    expect(await prisma.conductEntry.count({ where: { academicYearId: made.yearId } })).toBe(0);
    expect(await prisma.activityEntry.count({ where: { academicYearId: made.yearId } })).toBe(0);
    // These four are scoped through the deleted sections/term/session rather
    // than academicYearId directly, so check them by the fixture's own ids.
    expect(await prisma.teacherAssignment.count({ where: { sectionId: { in: made.sectionIds } } })).toBe(0);
    expect(await prisma.timetablePeriod.count({ where: { sectionId: { in: made.sectionIds } } })).toBe(0);
    expect(await prisma.mark.count({ where: { examTermId: made.examTermId } })).toBe(0);
    expect(await prisma.attendanceRecord.count({ where: { sessionId: made.attendanceSessionId } })).toBe(0);

    // Nothing outside the year moved: grades, subject, staff and students
    // remain, and no student's status was touched.
    const grades = await prisma.grade.findMany({ where: { id: { in: made.gradeIds } } });
    expect(grades).toHaveLength(made.gradeIds.length);
    expect(await prisma.subject.findUnique({ where: { id: made.subjectId } })).not.toBeNull();
    expect(await prisma.staff.findUnique({ where: { id: made.staffId } })).not.toBeNull();
    const statusesAfter = (
      await prisma.student.findMany({
        where: { id: { in: made.studentIds } },
        select: { id: true, status: true },
      })
    ).sort((a, b) => a.id - b.id);
    expect(statusesAfter).toHaveLength(statusesBefore.length);
    expect(statusesAfter).toEqual(statusesBefore);

    // The restore point was captured before the delete, inside the same
    // transaction, and reports the same counts.
    expect(result.restorePointId).not.toBeNull();
    const restorePoint = await prisma.restorePoint.findUnique({
      where: { id: result.restorePointId! },
    });
    expect(restorePoint).not.toBeNull();
    expect(restorePoint?.yearNameBS).toBe(YEAR);
    expect(restorePoint?.counts).toEqual(result.counts);
  });

  it("deletes the untaught fixture year without a restore point when asked not to", async () => {
    const restorePointsBefore = await prisma.restorePoint.count();

    const summary = await summariseYear(made.bareYearId);
    const result = await deleteYearWithData(made.bareYearId, {
      createRestorePoint: false,
      actorUserId: null,
    });

    expect(result.counts).toEqual(summary.counts);
    expect(result.restorePointId).toBeNull();
    // No row appeared anywhere, not just none named for this year.
    expect(await prisma.restorePoint.count()).toBe(restorePointsBefore);

    expect(await prisma.academicYear.findUnique({ where: { id: made.bareYearId } })).toBeNull();
    expect(await prisma.section.count({ where: { id: made.bareSectionId } })).toBe(0);
    expect(await prisma.subjectOffering.count({ where: { id: made.bareOfferingId } })).toBe(0);
    // The subject and grade this bare year borrowed are shared fixtures and
    // must survive.
    expect(await prisma.subject.findUnique({ where: { id: made.subjectId } })).not.toBeNull();
    expect(await prisma.grade.findUnique({ where: { id: made.gradeIds[0] } })).not.toBeNull();
  });
});
