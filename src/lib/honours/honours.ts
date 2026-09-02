import { prisma } from "@/lib/prisma";
import { evaluate, rank, summarise } from "@/lib/assessment/grading";
import { attendancePercent } from "@/lib/attendance/strip";
import { listActivities, listConduct, type ActivityRow, type ConductRow } from "./entries";
import {
  activityScore,
  conductScore,
  examScore,
  overallScore,
  type Pillars,
  type Weights,
} from "./score";
import { getWeights } from "./weights";

// Builds the honours table for a year in a fixed number of queries, whatever
// the size of the school: it evaluates each student's published results
// itself with the same grading functions the ledger uses, rather than calling
// getLedger() once per term and section.

export type HonoursStudent = {
  studentId: number;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  rollNo: number;
  pillars: Pillars;
  overall: number | null;
  position: number | null;
};

export type SectionHonours = {
  sectionId: number;
  gradeId: number;
  gradeName: string;
  sectionName: string;
  classTeacher: string | null;
  /// Ranked students first in position order, then the unranked by roll.
  students: HonoursStudent[];
};

export type Honours = {
  year: { id: number; nameBS: string };
  weights: Weights;
  publishedTerms: number;
  sections: SectionHonours[];
};

export async function getHonours(
  academicYearId: number,
  scope: { sectionId?: number } = {},
): Promise<Honours | null> {
  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, nameBS: true },
  });
  if (!year) return null;

  const sectionWhere = scope.sectionId === undefined ? {} : { id: scope.sectionId };
  const enrolmentWhere = scope.sectionId === undefined ? {} : { sectionId: scope.sectionId };

  const [weights, sections, enrolments, offerings, terms, marks, attendance, conduct, activities] =
    await Promise.all([
      getWeights(),
      prisma.section.findMany({
        where: { academicYearId, ...sectionWhere },
        orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
        include: { grade: { select: { name: true } }, classTeacher: { select: { fullName: true } } },
      }),
      prisma.enrollment.findMany({
        where: { academicYearId, student: { status: "ACTIVE" }, ...enrolmentWhere },
        orderBy: { rollNo: "asc" },
        include: {
          student: { select: { id: true, fullName: true, fullNameNp: true, photoId: true } },
        },
      }),
      prisma.subjectOffering.findMany({ where: { academicYearId } }),
      prisma.examTerm.findMany({
        where: { academicYearId, isPublished: true },
        select: { id: true },
      }),
      prisma.mark.findMany({
        where: { examTerm: { academicYearId, isPublished: true } },
        select: {
          examTermId: true,
          studentId: true,
          subjectOfferingId: true,
          theory: true,
          practical: true,
          isAbsent: true,
        },
      }),
      prisma.attendanceRecord.findMany({
        where: { session: { academicYearId, ...enrolmentWhere } },
        select: { studentId: true, status: true },
      }),
      prisma.conductEntry.groupBy({
        by: ["studentId", "kind"],
        where: { academicYearId },
        _sum: { points: true },
      }),
      prisma.activityEntry.groupBy({
        by: ["studentId"],
        where: { academicYearId },
        _sum: { points: true },
      }),
    ]);

  // Offerings by grade, marks by (term, student, offering).
  const offeringsByGrade = new Map<number, typeof offerings>();
  for (const o of offerings) {
    const list = offeringsByGrade.get(o.gradeId) ?? [];
    list.push(o);
    offeringsByGrade.set(o.gradeId, list);
  }
  const markKey = (termId: number, studentId: number, offeringId: number) =>
    `${termId}:${studentId}:${offeringId}`;
  const markByKey = new Map(
    marks.map((m) => [markKey(m.examTermId, m.studentId, m.subjectOfferingId), m]),
  );

  const attendanceByStudent = new Map<number, { status: string }[]>();
  for (const r of attendance) {
    const list = attendanceByStudent.get(r.studentId) ?? [];
    list.push(r);
    attendanceByStudent.set(r.studentId, list);
  }

  const conductByStudent = new Map<number, { merits: number; demerits: number }>();
  for (const row of conduct) {
    const entry = conductByStudent.get(row.studentId) ?? { merits: 0, demerits: 0 };
    if (row.kind === "MERIT") entry.merits += row._sum.points ?? 0;
    else entry.demerits += row._sum.points ?? 0;
    conductByStudent.set(row.studentId, entry);
  }
  const activityByStudent = new Map(activities.map((a) => [a.studentId, a._sum.points ?? 0]));

  const examPillar = (studentId: number, gradeId: number): number | null => {
    const graded = offeringsByGrade.get(gradeId) ?? [];
    if (graded.length === 0) return null;
    const percents = terms.map((term) => {
      const results = graded.map((offering) => {
        const mark = markByKey.get(markKey(term.id, studentId, offering.id));
        return evaluate(
          {
            theory: mark?.theory ?? null,
            practical: mark?.practical ?? null,
            isAbsent: mark?.isAbsent ?? false,
          },
          offering,
        );
      });
      const overall = summarise(results);
      return overall.complete ? overall.percent : null;
    });
    return examScore(percents);
  };

  const pillarsFor = (studentId: number, gradeId: number): Pillars => {
    const c = conductByStudent.get(studentId) ?? { merits: 0, demerits: 0 };
    return {
      exams: examPillar(studentId, gradeId),
      attendance: attendancePercent(attendanceByStudent.get(studentId) ?? []),
      conduct: conductScore(c.merits, c.demerits),
      activities: activityScore(activityByStudent.get(studentId) ?? 0),
    };
  };

  const bySection = new Map<number, typeof enrolments>();
  for (const e of enrolments) {
    const list = bySection.get(e.sectionId) ?? [];
    list.push(e);
    bySection.set(e.sectionId, list);
  }

  const result: SectionHonours[] = sections.map((section) => {
    const rows = (bySection.get(section.id) ?? []).map((e) => {
      const pillars = pillarsFor(e.student.id, section.gradeId);
      return {
        studentId: e.student.id,
        fullName: e.student.fullName,
        fullNameNp: e.student.fullNameNp,
        photoId: e.student.photoId,
        rollNo: e.rollNo,
        pillars,
        overall: overallScore(pillars, weights),
      };
    });
    const positions = rank(rows, (r) => r.overall);
    const students: HonoursStudent[] = rows
      .map((r) => ({ ...r, position: positions.get(r) ?? null }))
      .sort((a, b) => {
        if (a.position === null && b.position === null) return a.rollNo - b.rollNo;
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position || a.rollNo - b.rollNo;
      });

    return {
      sectionId: section.id,
      gradeId: section.gradeId,
      gradeName: section.grade.name,
      sectionName: section.name,
      classTeacher: section.classTeacher?.fullName ?? null,
      students,
    };
  });

  return { year, weights, publishedTerms: terms.length, sections: result };
}

export type StudentHonours = {
  position: number | null;
  classSize: number;
  overall: number | null;
  pillars: Pillars;
  weights: Weights;
  conduct: ConductRow[];
  activities: ActivityRow[];
};

/// One student's standing, worked out from their whole section because a
/// position only means something against classmates.
export async function getStudentHonours(
  studentId: number,
  academicYearId: number,
): Promise<StudentHonours | null> {
  const enrolment = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    select: { sectionId: true },
  });
  if (!enrolment) return null;

  const [honours, conduct, activities] = await Promise.all([
    getHonours(academicYearId, { sectionId: enrolment.sectionId }),
    listConduct(studentId, academicYearId),
    listActivities(studentId, academicYearId),
  ]);
  const section = honours?.sections[0];
  const row = section?.students.find((s) => s.studentId === studentId);
  if (!honours || !section || !row) return null;

  return {
    position: row.position,
    classSize: section.students.length,
    overall: row.overall,
    pillars: row.pillars,
    weights: honours.weights,
    conduct,
    activities,
  };
}
