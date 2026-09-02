import type { ActivityLevel, AttendanceStatus, ConductKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { PAYLOAD_VERSION, type RestorePayload, type YearCounts } from "./year-teardown";

export class RestoreError extends Error {}

// ---------------------------------------------------------------------------
// Row shapes the payload's `unknown[]` arrays are narrowed into, once, at the
// top of restoreYear (Controller ruling R1). Dates come back as ISO strings —
// a Date written into a Json column serialises the same way JSON.stringify
// serialises any Date — so every date field here is typed `string` and is
// turned back into a Date only at the point of insertion.
// ---------------------------------------------------------------------------

type SectionRow = {
  id: number;
  name: string;
  gradeId: number;
  academicYearId: number;
  classTeacherId: number | null;
};

type OfferingRow = {
  id: number;
  subjectId: number;
  gradeId: number;
  academicYearId: number;
  hasPractical: boolean;
  fullMarksTheory: number;
  passMarksTheory: number;
  fullMarksPractical: number | null;
  passMarksPractical: number | null;
};

type AssignmentRow = { id: number; staffId: number; sectionId: number; subjectOfferingId: number };

type PeriodRow = {
  id: number;
  teacherAssignmentId: number;
  sectionId: number;
  schoolPeriodId: number;
  dayOfWeek: number;
  room: string;
};

type EnrollmentRow = {
  id: number;
  studentId: number;
  sectionId: number;
  academicYearId: number;
  rollNo: number;
  enrolledOn: string;
};

type ExamTermRow = {
  id: number;
  academicYearId: number;
  name: string;
  order: number;
  startsOn: string | null;
  endsOn: string | null;
  isPublished: boolean;
  createdAt: string;
};

type MarkRow = {
  id: number;
  examTermId: number;
  studentId: number;
  subjectOfferingId: number;
  theory: number | null;
  practical: number | null;
  isAbsent: boolean;
  updatedAt: string;
};

type AttendanceSessionRow = {
  id: number;
  sectionId: number;
  academicYearId: number;
  date: string;
  takenById: number | null;
  takenAt: string;
};

type AttendanceRecordRow = {
  id: number;
  sessionId: number;
  studentId: number;
  status: AttendanceStatus;
  note: string | null;
};

type ConductEntryRow = {
  id: number;
  studentId: number;
  academicYearId: number;
  kind: ConductKind;
  points: number;
  date: string;
  note: string;
  recordedById: number | null;
  createdAt: string;
};

type ActivityEntryRow = {
  id: number;
  studentId: number;
  academicYearId: number;
  name: string;
  level: ActivityLevel;
  points: number;
  date: string;
  recordedById: number | null;
  createdAt: string;
};

/// The one narrowing point for a payload array: asserts it is at least an
/// array, and hands back a typed view. A payload that fails even this is
/// malformed, not merely missing a few foreign rows.
function asRows<T>(value: unknown, table: string): T[] {
  if (!Array.isArray(value)) {
    throw new RestoreError(`This restore point's payload is malformed: "${table}" is not an array.`);
  }
  return value as T[];
}

function uniqueIds(ids: (number | null | undefined)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id != null))];
}

export type RestoreOutcome = { restored: number; skipped: number; reason?: string };

export type RestoreReport = {
  yearNameBS: string;
  tables: Record<keyof YearCounts, RestoreOutcome>;
};

/// Turns per-cause skip counts into one reason sentence. A single active
/// cause reads exactly like "N skipped — <cause>"; more than one names each
/// count so nothing is hidden behind a vague total.
function outcomeFrom(restored: number, causes: { count: number; phrase: string }[]): RestoreOutcome {
  const active = causes.filter((c) => c.count > 0);
  if (active.length === 0) return { restored, skipped: 0 };

  const skipped = active.reduce((sum, c) => sum + c.count, 0);
  const reason =
    active.length === 1
      ? `${skipped} skipped — ${active[0].phrase}`
      : `${skipped} skipped — ${active.map((c) => `${c.count} because ${c.phrase}`).join("; ")}`;
  return { restored, skipped, reason };
}

export type RestorePointSummary = {
  id: number;
  yearNameBS: string;
  createdAt: Date;
  counts: YearCounts;
  createdByUsername: string | null;
  payloadBytes: number;
};

/// Restore points listed by their metadata only — `payload` can be tens of
/// thousands of rows, so the list is a raw query that never selects it, and
/// asks Postgres for its size instead of loading it to measure.
export async function listRestorePoints(): Promise<RestorePointSummary[]> {
  const rows = await prisma.$queryRaw<
    {
      id: number;
      yearNameBS: string;
      createdAt: Date;
      counts: YearCounts;
      username: string | null;
      payloadBytes: number;
    }[]
  >`
    SELECT
      rp.id,
      rp."yearNameBS",
      rp."createdAt",
      rp.counts,
      u.username,
      pg_column_size(rp.payload) AS "payloadBytes"
    FROM "RestorePoint" rp
    LEFT JOIN "User" u ON u.id = rp."createdById"
    ORDER BY rp."createdAt" DESC
  `;

  return rows.map((row) => ({
    id: row.id,
    yearNameBS: row.yearNameBS,
    createdAt: row.createdAt,
    counts: row.counts,
    createdByUsername: row.username,
    payloadBytes: Number(row.payloadBytes),
  }));
}

/// Brings a deleted year back from its restore point. Rows keep their
/// original ids — Postgres never reissues a deleted one, so every internal
/// reference in the payload resolves without remapping — and a row is only
/// skipped when something *outside* the year (a grade, subject, student,
/// staff member, bell period or user) is gone; a missing class teacher or
/// recorder nulls a column instead, because losing the section or entry over
/// it would lose everything enrolled or recorded under it.
export async function restoreYear(restorePointId: number): Promise<RestoreReport> {
  const restorePoint = await prisma.restorePoint.findUnique({ where: { id: restorePointId } });
  if (!restorePoint) throw new RestoreError("That restore point no longer exists.");

  const payload = restorePoint.payload as unknown as RestorePayload;
  if (payload.version !== PAYLOAD_VERSION) {
    throw new RestoreError(
      `This restore point was captured with payload version ${payload.version}, but this build expects version ${PAYLOAD_VERSION}.`,
    );
  }

  // Restore never merges into a live year — a name collision means the
  // school already has a year by that name, deliberately or by accident.
  const clash = await prisma.academicYear.findUnique({
    where: { nameBS: payload.year.nameBS },
    select: { id: true },
  });
  if (clash) {
    throw new RestoreError(
      `An academic year named ${payload.year.nameBS} already exists. Restore never merges into a live year.`,
    );
  }

  const sections = asRows<SectionRow>(payload.sections, "sections");
  const offerings = asRows<OfferingRow>(payload.offerings, "offerings");
  const assignments = asRows<AssignmentRow>(payload.assignments, "assignments");
  const periods = asRows<PeriodRow>(payload.periods, "periods");
  const enrollments = asRows<EnrollmentRow>(payload.enrollments, "enrollments");
  const examTerms = asRows<ExamTermRow>(payload.examTerms, "examTerms");
  const marks = asRows<MarkRow>(payload.marks, "marks");
  const attendanceSessions = asRows<AttendanceSessionRow>(payload.attendanceSessions, "attendanceSessions");
  const attendanceRecords = asRows<AttendanceRecordRow>(payload.attendanceRecords, "attendanceRecords");
  const conduct = asRows<ConductEntryRow>(payload.conduct, "conduct");
  const activities = asRows<ActivityEntryRow>(payload.activities, "activities");

  // The ids that decide skips, scoped to what the payload actually
  // references rather than whole tables. Read once, ahead of the transaction
  // that does the writing.
  const [gradeRows, subjectRows, studentRows, staffRows, schoolPeriodRows, userRows] = await Promise.all([
    prisma.grade.findMany({
      where: { id: { in: uniqueIds([...sections.map((s) => s.gradeId), ...offerings.map((o) => o.gradeId)]) } },
      select: { id: true },
    }),
    prisma.subject.findMany({
      where: { id: { in: uniqueIds(offerings.map((o) => o.subjectId)) } },
      select: { id: true },
    }),
    prisma.student.findMany({
      where: {
        id: {
          in: uniqueIds([
            ...enrollments.map((e) => e.studentId),
            ...marks.map((m) => m.studentId),
            ...attendanceRecords.map((r) => r.studentId),
            ...conduct.map((c) => c.studentId),
            ...activities.map((a) => a.studentId),
          ]),
        },
      },
      select: { id: true },
    }),
    prisma.staff.findMany({
      where: {
        id: {
          in: uniqueIds([
            ...sections.map((s) => s.classTeacherId),
            ...assignments.map((a) => a.staffId),
            ...attendanceSessions.map((s) => s.takenById),
          ]),
        },
      },
      select: { id: true },
    }),
    prisma.schoolPeriod.findMany({
      where: { id: { in: uniqueIds(periods.map((p) => p.schoolPeriodId)) } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        id: { in: uniqueIds([...conduct.map((c) => c.recordedById), ...activities.map((a) => a.recordedById)]) },
      },
      select: { id: true },
    }),
  ]);
  const existingGradeIds = new Set(gradeRows.map((r) => r.id));
  const existingSubjectIds = new Set(subjectRows.map((r) => r.id));
  const existingStudentIds = new Set(studentRows.map((r) => r.id));
  const existingStaffIds = new Set(staffRows.map((r) => r.id));
  const existingSchoolPeriodIds = new Set(schoolPeriodRows.map((r) => r.id));
  const existingUserIds = new Set(userRows.map((r) => r.id));

  return prisma.$transaction(
    async (tx) => {
      await tx.academicYear.create({
        data: {
          id: payload.year.id,
          nameBS: payload.year.nameBS,
          startsOn: new Date(payload.year.startsOn),
          endsOn: new Date(payload.year.endsOn),
          // A restored year comes back dormant; switching to it is a separate,
          // deliberate action.
          isCurrent: false,
        },
      });

      const skippedOfferingIds = new Set<number>();
      let offeringsRestored = 0;
      let offeringsSkippedSubject = 0;
      let offeringsSkippedGrade = 0;
      for (const row of offerings) {
        if (!existingSubjectIds.has(row.subjectId)) {
          skippedOfferingIds.add(row.id);
          offeringsSkippedSubject++;
          continue;
        }
        if (!existingGradeIds.has(row.gradeId)) {
          skippedOfferingIds.add(row.id);
          offeringsSkippedGrade++;
          continue;
        }
        await tx.subjectOffering.create({
          data: {
            id: row.id,
            subjectId: row.subjectId,
            gradeId: row.gradeId,
            academicYearId: payload.year.id,
            hasPractical: row.hasPractical,
            fullMarksTheory: row.fullMarksTheory,
            passMarksTheory: row.passMarksTheory,
            fullMarksPractical: row.fullMarksPractical,
            passMarksPractical: row.passMarksPractical,
          },
        });
        offeringsRestored++;
      }

      const skippedSectionIds = new Set<number>();
      let sectionsRestored = 0;
      let sectionsSkippedGrade = 0;
      for (const row of sections) {
        if (!existingGradeIds.has(row.gradeId)) {
          skippedSectionIds.add(row.id);
          sectionsSkippedGrade++;
          continue;
        }
        // The section itself still comes back even if its class teacher left —
        // only the reference is nulled, so every enrolment under it survives.
        const classTeacherId =
          row.classTeacherId != null && existingStaffIds.has(row.classTeacherId) ? row.classTeacherId : null;
        await tx.section.create({
          data: { id: row.id, name: row.name, gradeId: row.gradeId, academicYearId: payload.year.id, classTeacherId },
        });
        sectionsRestored++;
      }

      const skippedAssignmentIds = new Set<number>();
      let assignmentsRestored = 0;
      let assignmentsSkippedStaff = 0;
      let assignmentsSkippedSection = 0;
      let assignmentsSkippedOffering = 0;
      for (const row of assignments) {
        if (!existingStaffIds.has(row.staffId)) {
          skippedAssignmentIds.add(row.id);
          assignmentsSkippedStaff++;
          continue;
        }
        if (skippedSectionIds.has(row.sectionId)) {
          skippedAssignmentIds.add(row.id);
          assignmentsSkippedSection++;
          continue;
        }
        if (skippedOfferingIds.has(row.subjectOfferingId)) {
          skippedAssignmentIds.add(row.id);
          assignmentsSkippedOffering++;
          continue;
        }
        await tx.teacherAssignment.create({
          data: { id: row.id, staffId: row.staffId, sectionId: row.sectionId, subjectOfferingId: row.subjectOfferingId },
        });
        assignmentsRestored++;
      }

      let periodsRestored = 0;
      let periodsSkippedPeriod = 0;
      let periodsSkippedLesson = 0;
      for (const row of periods) {
        if (!existingSchoolPeriodIds.has(row.schoolPeriodId)) {
          periodsSkippedPeriod++;
          continue;
        }
        if (skippedAssignmentIds.has(row.teacherAssignmentId) || skippedSectionIds.has(row.sectionId)) {
          periodsSkippedLesson++;
          continue;
        }
        await tx.timetablePeriod.create({
          data: {
            id: row.id,
            teacherAssignmentId: row.teacherAssignmentId,
            sectionId: row.sectionId,
            schoolPeriodId: row.schoolPeriodId,
            dayOfWeek: row.dayOfWeek,
            room: row.room,
          },
        });
        periodsRestored++;
      }

      let enrollmentsRestored = 0;
      let enrollmentsSkippedStudent = 0;
      let enrollmentsSkippedSection = 0;
      for (const row of enrollments) {
        if (!existingStudentIds.has(row.studentId)) {
          enrollmentsSkippedStudent++;
          continue;
        }
        if (skippedSectionIds.has(row.sectionId)) {
          enrollmentsSkippedSection++;
          continue;
        }
        await tx.enrollment.create({
          data: {
            id: row.id,
            studentId: row.studentId,
            sectionId: row.sectionId,
            academicYearId: payload.year.id,
            rollNo: row.rollNo,
            enrolledOn: new Date(row.enrolledOn),
          },
        });
        enrollmentsRestored++;
      }

      // An exam term only ever points at the year being restored, so it can
      // never be skipped by anything outside it.
      for (const row of examTerms) {
        await tx.examTerm.create({
          data: {
            id: row.id,
            academicYearId: payload.year.id,
            name: row.name,
            order: row.order,
            startsOn: row.startsOn ? new Date(row.startsOn) : null,
            endsOn: row.endsOn ? new Date(row.endsOn) : null,
            isPublished: row.isPublished,
            createdAt: new Date(row.createdAt),
          },
        });
      }

      let marksRestored = 0;
      let marksSkippedStudent = 0;
      let marksSkippedOffering = 0;
      for (const row of marks) {
        if (!existingStudentIds.has(row.studentId)) {
          marksSkippedStudent++;
          continue;
        }
        if (skippedOfferingIds.has(row.subjectOfferingId)) {
          marksSkippedOffering++;
          continue;
        }
        await tx.mark.create({
          data: {
            id: row.id,
            examTermId: row.examTermId,
            studentId: row.studentId,
            subjectOfferingId: row.subjectOfferingId,
            theory: row.theory,
            practical: row.practical,
            isAbsent: row.isAbsent,
            updatedAt: new Date(row.updatedAt),
          },
        });
        marksRestored++;
      }

      const skippedSessionIds = new Set<number>();
      let sessionsRestored = 0;
      let sessionsSkippedSection = 0;
      for (const row of attendanceSessions) {
        if (skippedSectionIds.has(row.sectionId)) {
          skippedSessionIds.add(row.id);
          sessionsSkippedSection++;
          continue;
        }
        const takenById = row.takenById != null && existingStaffIds.has(row.takenById) ? row.takenById : null;
        await tx.attendanceSession.create({
          data: {
            id: row.id,
            sectionId: row.sectionId,
            academicYearId: payload.year.id,
            date: new Date(row.date),
            takenById,
            takenAt: new Date(row.takenAt),
          },
        });
        sessionsRestored++;
      }

      let recordsRestored = 0;
      let recordsSkippedStudent = 0;
      let recordsSkippedSession = 0;
      for (const row of attendanceRecords) {
        if (!existingStudentIds.has(row.studentId)) {
          recordsSkippedStudent++;
          continue;
        }
        if (skippedSessionIds.has(row.sessionId)) {
          recordsSkippedSession++;
          continue;
        }
        await tx.attendanceRecord.create({
          data: { id: row.id, sessionId: row.sessionId, studentId: row.studentId, status: row.status, note: row.note },
        });
        recordsRestored++;
      }

      let conductRestored = 0;
      let conductSkippedStudent = 0;
      for (const row of conduct) {
        if (!existingStudentIds.has(row.studentId)) {
          conductSkippedStudent++;
          continue;
        }
        const recordedById = row.recordedById != null && existingUserIds.has(row.recordedById) ? row.recordedById : null;
        await tx.conductEntry.create({
          data: {
            id: row.id,
            studentId: row.studentId,
            academicYearId: payload.year.id,
            kind: row.kind,
            points: row.points,
            date: new Date(row.date),
            note: row.note,
            recordedById,
            createdAt: new Date(row.createdAt),
          },
        });
        conductRestored++;
      }

      let activitiesRestored = 0;
      let activitiesSkippedStudent = 0;
      for (const row of activities) {
        if (!existingStudentIds.has(row.studentId)) {
          activitiesSkippedStudent++;
          continue;
        }
        const recordedById = row.recordedById != null && existingUserIds.has(row.recordedById) ? row.recordedById : null;
        await tx.activityEntry.create({
          data: {
            id: row.id,
            studentId: row.studentId,
            academicYearId: payload.year.id,
            name: row.name,
            level: row.level,
            points: row.points,
            date: new Date(row.date),
            recordedById,
            createdAt: new Date(row.createdAt),
          },
        });
        activitiesRestored++;
      }

      const tables: Record<keyof YearCounts, RestoreOutcome> = {
        sections: outcomeFrom(sectionsRestored, [
          { count: sectionsSkippedGrade, phrase: "their grade no longer exists" },
        ]),
        offerings: outcomeFrom(offeringsRestored, [
          { count: offeringsSkippedSubject, phrase: "their subject no longer exists" },
          { count: offeringsSkippedGrade, phrase: "their grade no longer exists" },
        ]),
        assignments: outcomeFrom(assignmentsRestored, [
          { count: assignmentsSkippedStaff, phrase: "their teacher no longer exists" },
          { count: assignmentsSkippedSection, phrase: "their section was skipped" },
          { count: assignmentsSkippedOffering, phrase: "their subject offering was skipped" },
        ]),
        periods: outcomeFrom(periodsRestored, [
          { count: periodsSkippedPeriod, phrase: "their bell period no longer exists" },
          { count: periodsSkippedLesson, phrase: "their lesson was skipped" },
        ]),
        enrollments: outcomeFrom(enrollmentsRestored, [
          { count: enrollmentsSkippedStudent, phrase: "those students no longer exist" },
          { count: enrollmentsSkippedSection, phrase: "their section was skipped" },
        ]),
        examTerms: { restored: examTerms.length, skipped: 0 },
        marks: outcomeFrom(marksRestored, [
          { count: marksSkippedStudent, phrase: "those students no longer exist" },
          { count: marksSkippedOffering, phrase: "their subject offering was skipped" },
        ]),
        attendanceSessions: outcomeFrom(sessionsRestored, [
          { count: sessionsSkippedSection, phrase: "their section was skipped" },
        ]),
        attendanceRecords: outcomeFrom(recordsRestored, [
          { count: recordsSkippedStudent, phrase: "those students no longer exist" },
          { count: recordsSkippedSession, phrase: "their attendance session was skipped" },
        ]),
        conduct: outcomeFrom(conductRestored, [
          { count: conductSkippedStudent, phrase: "those students no longer exist" },
        ]),
        activities: outcomeFrom(activitiesRestored, [
          { count: activitiesSkippedStudent, phrase: "those students no longer exist" },
        ]),
      };

      return { yearNameBS: payload.year.nameBS, tables };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

/// A restore point is deleted deliberately, never as a side effect of a
/// successful restore — a restore that produced the wrong thing must stay
/// retryable.
export function deleteRestorePoint(id: number) {
  return prisma.restorePoint.delete({ where: { id } });
}
