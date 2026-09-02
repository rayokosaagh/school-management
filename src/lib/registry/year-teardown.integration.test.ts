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
import { snapshotYear, summariseYear, YearTeardownError, PAYLOAD_VERSION } from "./year-teardown";

// Talks to the real database. Everything it makes is torn down afterwards, and
// it touches nothing it did not create.
const made = {
  yearId: 0,
  bareYearId: 0,
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
  /// The year the school had marked current before this suite hijacked it.
  previousCurrentYearId: null as number | null,
};

const YEAR = "2087";
const BARE_YEAR = "2088";
const stamp = Date.now() % 100000;

afterAll(async () => {
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
  if (made.bareSectionId) await prisma.section.deleteMany({ where: { id: made.bareSectionId } });
  if (made.sectionIds.length) {
    await prisma.section.deleteMany({ where: { id: { in: made.sectionIds } } });
  }
  if (made.gradeIds.length) {
    await prisma.grade.deleteMany({ where: { id: { in: made.gradeIds } } });
  }
  if (made.staffId) await prisma.staff.deleteMany({ where: { id: made.staffId } });
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

  it("counts every table exactly and marks the year as taught", async () => {
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
    expect(summary.taught).toBe(true);
  });

  it("marks an untaught year as not taught", async () => {
    const summary = await summariseYear(made.bareYearId);

    expect(summary.counts.sections).toBe(1);
    expect(summary.counts.offerings).toBe(1);
    expect(summary.counts.attendanceSessions).toBe(0);
    expect(summary.counts.marks).toBe(0);
    expect(summary.taught).toBe(false);
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
});
