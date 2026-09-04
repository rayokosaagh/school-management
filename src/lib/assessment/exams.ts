import { prisma } from "@/lib/prisma";
import { evaluate, rank, summarise, type Scheme } from "./grading";

export class AssessmentError extends Error {}

export function listExamTerms(academicYearId: number) {
  return prisma.examTerm.findMany({
    where: { academicYearId },
    orderBy: { order: "asc" },
    include: { _count: { select: { marks: true } } },
  });
}

export function getExamTerm(id: number) {
  return prisma.examTerm.findUnique({ where: { id } });
}

export async function createExamTerm(input: {
  academicYearId: number;
  name: string;
  startsOn?: Date | null;
  endsOn?: Date | null;
}) {
  const highest = await prisma.examTerm.aggregate({
    where: { academicYearId: input.academicYearId },
    _max: { order: true },
  });
  return prisma.examTerm.create({
    data: {
      academicYearId: input.academicYearId,
      name: input.name,
      order: (highest._max.order ?? -1) + 1,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    },
  });
}

export function updateExamTerm(
  id: number,
  data: { name: string; startsOn?: Date | null; endsOn?: Date | null },
) {
  return prisma.examTerm.update({
    where: { id },
    data: { name: data.name, startsOn: data.startsOn ?? null, endsOn: data.endsOn ?? null },
  });
}

export function setExamPublished(id: number, isPublished: boolean) {
  return prisma.examTerm.update({ where: { id }, data: { isPublished } });
}

/// Deleting an exam takes its marks with it, so it is refused once any have
/// been entered — that is a term's worth of work, not a typo to undo.
export async function deleteExamTerm(id: number) {
  const marks = await prisma.mark.count({ where: { examTermId: id } });
  if (marks > 0) {
    throw new AssessmentError(
      `${marks} mark(s) recorded against this exam. Clear them before deleting it.`,
    );
  }
  return prisma.examTerm.delete({ where: { id } });
}

const schemeOf = (o: {
  fullMarksTheory: number;
  passMarksTheory: number;
  hasPractical: boolean;
  fullMarksPractical: number | null;
  passMarksPractical: number | null;
}): Scheme => o;

/// The entry grid for one subject in one section: every enrolled student with
/// whatever has been recorded so far.
export async function getMarksSheet(
  examTermId: number,
  sectionId: number,
  subjectOfferingId: number,
) {
  const [term, section, offering] = await Promise.all([
    prisma.examTerm.findUnique({ where: { id: examTermId } }),
    prisma.section.findUnique({
      where: { id: sectionId },
      include: { grade: true, academicYear: true },
    }),
    prisma.subjectOffering.findUnique({
      where: { id: subjectOfferingId },
      include: { subject: true },
    }),
  ]);

  if (!term) throw new AssessmentError("That exam no longer exists.");
  if (!section) throw new AssessmentError("That section no longer exists.");
  if (!offering) throw new AssessmentError("That subject is no longer offered.");

  // Nothing in the schema stops a Class 9 offering being paired with a Class 5
  // section, or a mark being filed against another year's exam.
  if (offering.gradeId !== section.gradeId) {
    throw new AssessmentError("That subject is not taught to this section's grade.");
  }
  if (
    offering.academicYearId !== section.academicYearId ||
    term.academicYearId !== section.academicYearId
  ) {
    throw new AssessmentError("Exam, section and subject belong to different years.");
  }

  const [enrolments, marks] = await Promise.all([
    prisma.enrollment.findMany({
      where: { sectionId, academicYearId: section.academicYearId },
      orderBy: { rollNo: "asc" },
      include: { student: { select: { id: true, fullName: true, status: true } } },
    }),
    prisma.mark.findMany({ where: { examTermId, subjectOfferingId } }),
  ]);

  const byStudent = new Map(marks.map((m) => [m.studentId, m]));

  return {
    term,
    section,
    offering,
    locked: term.isPublished,
    rows: enrolments
      .filter((e) => e.student.status === "ACTIVE")
      .map((e) => {
        const mark = byStudent.get(e.student.id);
        return {
          studentId: e.student.id,
          fullName: e.student.fullName,
          rollNo: e.rollNo,
          theory: mark?.theory ?? null,
          practical: mark?.practical ?? null,
          isAbsent: mark?.isAbsent ?? false,
        };
      }),
  };
}

export type MarkEntry = {
  studentId: number;
  theory: number | null;
  practical: number | null;
  isAbsent: boolean;
};

/// Saves a whole subject sheet. Validates against the offering's own full marks,
/// because a mark above the paper's total is a typo that would silently inflate
/// a GPA later.
export async function saveMarks(
  examTermId: number,
  sectionId: number,
  subjectOfferingId: number,
  entries: MarkEntry[],
) {
  const sheet = await getMarksSheet(examTermId, sectionId, subjectOfferingId);
  if (sheet.locked) {
    throw new AssessmentError("That exam is published. Unpublish it before editing marks.");
  }

  const allowed = new Set(sheet.rows.map((r) => r.studentId));
  const offering = sheet.offering;

  for (const entry of entries) {
    if (!allowed.has(entry.studentId)) {
      throw new AssessmentError("A student on that sheet is not in this section.");
    }
    if (entry.isAbsent) continue;

    if (entry.theory !== null) {
      if (entry.theory < 0 || entry.theory > offering.fullMarksTheory) {
        throw new AssessmentError(
          `Theory marks must be between 0 and ${offering.fullMarksTheory}.`,
        );
      }
    }
    if (offering.hasPractical && entry.practical !== null) {
      const full = offering.fullMarksPractical ?? 0;
      if (entry.practical < 0 || entry.practical > full) {
        throw new AssessmentError(`Practical marks must be between 0 and ${full}.`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const blank =
        !entry.isAbsent && entry.theory === null && entry.practical === null;

      if (blank) {
        // An emptied row is a removal, not a zero.
        await tx.mark.deleteMany({
          where: { examTermId, subjectOfferingId, studentId: entry.studentId },
        });
        continue;
      }

      await tx.mark.upsert({
        where: {
          examTermId_studentId_subjectOfferingId: {
            examTermId,
            studentId: entry.studentId,
            subjectOfferingId,
          },
        },
        create: {
          examTermId,
          studentId: entry.studentId,
          subjectOfferingId,
          theory: entry.isAbsent ? null : entry.theory,
          practical: entry.isAbsent ? null : entry.practical,
          isAbsent: entry.isAbsent,
        },
        update: {
          theory: entry.isAbsent ? null : entry.theory,
          practical: entry.isAbsent ? null : entry.practical,
          isAbsent: entry.isAbsent,
        },
      });
    }
    return entries.length;
  });
}

/// The class ledger: every student against every subject, with totals, GPA and
/// position. This is what a marksheet is printed from.
export async function getLedger(examTermId: number, sectionId: number) {
  const [term, section] = await Promise.all([
    prisma.examTerm.findUnique({ where: { id: examTermId } }),
    prisma.section.findUnique({
      where: { id: sectionId },
      include: { grade: true, academicYear: true },
    }),
  ]);
  if (!term) throw new AssessmentError("That exam no longer exists.");
  if (!section) throw new AssessmentError("That section no longer exists.");

  const [offerings, enrolments, marks] = await Promise.all([
    prisma.subjectOffering.findMany({
      where: { gradeId: section.gradeId, academicYearId: section.academicYearId },
      orderBy: { subject: { name: "asc" } },
      include: { subject: true },
    }),
    prisma.enrollment.findMany({
      where: { sectionId, academicYearId: section.academicYearId },
      orderBy: { rollNo: "asc" },
      include: { student: { select: { id: true, fullName: true, status: true } } },
    }),
    prisma.mark.findMany({ where: { examTermId } }),
  ]);

  const key = (studentId: number, offeringId: number) => `${studentId}:${offeringId}`;
  const byKey = new Map(marks.map((m) => [key(m.studentId, m.subjectOfferingId), m]));

  const students = enrolments
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => {
      const subjects = offerings.map((offering) => {
        const mark = byKey.get(key(e.student.id, offering.id));
        const result = evaluate(
          {
            theory: mark?.theory ?? null,
            practical: mark?.practical ?? null,
            isAbsent: mark?.isAbsent ?? false,
          },
          schemeOf(offering),
        );
        return { offeringId: offering.id, subject: offering.subject.name, result };
      });

      const overall = summarise(subjects.map((s) => s.result));
      const grandTotal = overall.complete
        ? subjects.reduce((sum, s) => sum + (s.result.total ?? 0), 0)
        : null;

      return {
        studentId: e.student.id,
        fullName: e.student.fullName,
        rollNo: e.rollNo,
        subjects,
        overall,
        grandTotal,
      };
    });

  const positions = rank(students, (s) => s.grandTotal);

  return {
    term,
    section,
    offerings: offerings.map((o) => ({
      id: o.id,
      subjectId: o.subjectId,
      name: o.subject.name,
      hasPractical: o.hasPractical,
      fullMarks: o.fullMarksTheory + (o.hasPractical ? (o.fullMarksPractical ?? 0) : 0),
    })),
    students: students.map((s) => ({ ...s, position: positions.get(s) ?? null })),
  };
}

/// One student's result across every subject, for their profile and marksheet.
export async function getStudentResult(examTermId: number, studentId: number) {
  const enrolment = await prisma.enrollment.findFirst({
    where: { studentId, academicYear: { examTerms: { some: { id: examTermId } } } },
    include: { section: { include: { grade: true } }, academicYear: true },
  });
  if (!enrolment) return null;

  const ledger = await getLedger(examTermId, enrolment.sectionId);
  const row = ledger.students.find((s) => s.studentId === studentId) ?? null;
  return row ? { ...ledger, student: row } : null;
}

/// Every exam this student has marks for in their current year, each with the
/// class position that only a whole-section view can work out.
export async function getStudentMarksheets(studentId: number) {
  const enrolment = await prisma.enrollment.findFirst({
    where: { studentId, academicYear: { isCurrent: true } },
    include: { section: { include: { grade: true } }, academicYear: true },
  });
  if (!enrolment) return null;

  const terms = await prisma.examTerm.findMany({
    where: { academicYearId: enrolment.academicYearId },
    orderBy: { order: "asc" },
  });

  const sheets = [];
  for (const term of terms) {
    const ledger = await getLedger(term.id, enrolment.sectionId);
    const row = ledger.students.find((s) => s.studentId === studentId);
    if (!row) continue;

    // Skip exams this student has nothing recorded for; a blank marksheet is
    // noise, not information.
    const anything = row.subjects.some(
      (s) => s.result.total !== null || s.result.isAbsent,
    );
    if (!anything) continue;

    sheets.push({
      term,
      offerings: ledger.offerings,
      result: row,
      classSize: ledger.students.length,
    });
  }

  return { enrolment, sheets };
}
