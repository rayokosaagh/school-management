import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/scope";
import type { DashboardOverview } from "./overview";
import { recentDays, schoolDate } from "./overview";

// The panels that answer a role's own question, rather than restating the
// school's headline numbers in a different order. Kept out of overview.ts:
// that function is already the widest query in the app, and none of this is
// needed to draw the page's frame.

/// How many days back "recently" reaches when looking for a pattern of
/// absence. Two school weeks: long enough that one bad week is not a pattern,
/// short enough that a pupil who has since settled is not still listed.
const WATCH_DAYS = 14;

/// Absences within that window before a pupil is worth a mention. Three is
/// roughly a day a week — the point at which a class teacher would want to
/// ask, rather than a bad cold.
const WATCH_THRESHOLD = 3;

export type MarksGap = {
  key: string;
  subject: string;
  term: string;
  entered: number;
  expected: number;
};

export type WatchedPupil = {
  id: number;
  name: string;
  section: string;
  absences: number;
};

export type MoneyToday = {
  collectedToday: number;
  billed: number;
  collected: number;
  outstanding: number;
};

export type RoleInsights = {
  marks: MarksGap[];
  watch: WatchedPupil[];
  money: MoneyToday | null;
};

const NONE: RoleInsights = { marks: [], watch: [], money: null };

/// The role-specific panels, fetched only for the reader who can see them.
///
/// `sectionIds` comes from the overview that has already been built, so a
/// teacher's scope is decided once. Passing it rather than recomputing is what
/// keeps this from becoming a second, quietly different idea of "my classes".
export async function getRoleInsights(
  actor: Actor,
  academicYearId: number,
  access: DashboardOverview["access"],
  sectionIds: number[],
  now: Date,
): Promise<RoleInsights> {
  const teacher = actor.role === "TEACHER";
  const day = schoolDate(now);

  // A teacher with no linked staff record has no assignments and no sections;
  // every query below would either match nothing or, worse, match everything.
  if (teacher && (actor.staffId === null || sectionIds.length === 0)) return NONE;

  const [marks, watch, money] = await Promise.all([
    teacher && access.marks ? marksStillToEnter(actor.staffId!, academicYearId, sectionIds) : [],
    teacher && access.attendance ? pupilsToWatch(academicYearId, sectionIds, day) : [],
    !teacher && access.fees ? moneyToday(academicYearId, day) : null,
  ]);

  return { marks, watch, money };
}

/// Which of a teacher's subjects still have marks outstanding.
///
/// Counted per subject and term rather than per section: a subject offering
/// belongs to a grade, so a teacher taking the same subject in two sections of
/// one grade is doing a single piece of work and should see a single row.
async function marksStillToEnter(
  staffId: number,
  academicYearId: number,
  sectionIds: number[],
): Promise<MarksGap[]> {
  const [assignments, terms] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: { staffId, sectionId: { in: sectionIds } },
      select: {
        sectionId: true,
        subjectOfferingId: true,
        subjectOffering: { select: { gradeId: true, subject: { select: { name: true } } } },
        section: { select: { _count: { select: { enrollments: { where: { academicYearId } } } } } },
      },
    }),
    // Only the terms that have not gone out yet. A published exam's marks are
    // history: listing them as work outstanding would never clear.
    prisma.examTerm.findMany({
      where: { academicYearId, isPublished: false },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);

  if (assignments.length === 0 || terms.length === 0) return [];

  // How many pupils this teacher is responsible for per offering, across every
  // section of theirs that the offering's grade covers.
  const expectedByOffering = new Map<number, number>();
  const subjectByOffering = new Map<number, string>();
  for (const assignment of assignments) {
    const id = assignment.subjectOfferingId;
    subjectByOffering.set(id, assignment.subjectOffering.subject.name);
    expectedByOffering.set(
      id,
      (expectedByOffering.get(id) ?? 0) + assignment.section._count.enrollments,
    );
  }

  const offeringIds = [...expectedByOffering.keys()];
  const entered = await prisma.mark.groupBy({
    by: ["examTermId", "subjectOfferingId"],
    where: {
      examTermId: { in: terms.map((t) => t.id) },
      subjectOfferingId: { in: offeringIds },
      student: { enrollments: { some: { academicYearId, sectionId: { in: sectionIds } } } },
    },
    _count: { _all: true },
  });

  const enteredByPair = new Map(
    entered.map((row) => [`${row.examTermId}:${row.subjectOfferingId}`, row._count._all]),
  );

  const gaps: MarksGap[] = [];
  for (const term of terms) {
    for (const offeringId of offeringIds) {
      const expected = expectedByOffering.get(offeringId) ?? 0;
      if (expected === 0) continue;
      const count = enteredByPair.get(`${term.id}:${offeringId}`) ?? 0;
      if (count >= expected) continue;
      gaps.push({
        key: `${term.id}-${offeringId}`,
        subject: subjectByOffering.get(offeringId) ?? "Subject",
        term: term.name,
        entered: count,
        expected,
      });
    }
  }

  // The emptiest first: that is where the work is.
  return gaps.sort((a, b) => a.entered / a.expected - b.entered / b.expected).slice(0, 6);
}

/// Pupils whose absence has become a pattern rather than an occurrence.
async function pupilsToWatch(
  academicYearId: number,
  sectionIds: number[],
  day: Date,
): Promise<WatchedPupil[]> {
  const days = recentDays(day, WATCH_DAYS);

  const absences = await prisma.attendanceRecord.groupBy({
    by: ["studentId"],
    where: {
      status: "ABSENT",
      session: { academicYearId, sectionId: { in: sectionIds }, date: { in: days } },
    },
    _count: { _all: true },
  });

  const worrying = absences
    .filter((row) => row._count._all >= WATCH_THRESHOLD)
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 6);
  if (worrying.length === 0) return [];

  const students = await prisma.student.findMany({
    where: { id: { in: worrying.map((row) => row.studentId) } },
    select: {
      id: true,
      fullName: true,
      enrollments: {
        where: { academicYearId },
        select: { section: { select: { name: true, grade: { select: { name: true } } } } },
        take: 1,
      },
    },
  });
  const byId = new Map(students.map((student) => [student.id, student]));

  return worrying.flatMap((row) => {
    const student = byId.get(row.studentId);
    if (!student) return [];
    const enrolment = student.enrollments[0];
    return [{
      id: student.id,
      name: student.fullName,
      section: enrolment ? `${enrolment.section.grade.name} ${enrolment.section.name}` : "—",
      absences: row._count._all,
    }];
  });
}

/// The three fee numbers an office actually opens the page for.
///
/// Aggregates rather than `feeWorkspace`, which walks every enrolment in the
/// year to build a page this panel takes three figures from.
async function moneyToday(academicYearId: number, day: Date): Promise<MoneyToday> {
  const [today, billed, collected] = await Promise.all([
    prisma.payment.aggregate({
      where: { academicYearId, paidOn: day, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.invoiceLine.aggregate({
      where: { invoice: { academicYearId, status: { not: "CANCELLED" } } },
      _sum: { amount: true },
    }),
    // A reversed payment stays on the ledger for the audit trail but no longer
    // pays for anything, so only COMPLETED is summed.
    prisma.paymentAllocation.aggregate({
      where: {
        payment: { status: "COMPLETED" },
        invoiceLine: { invoice: { academicYearId, status: { not: "CANCELLED" } } },
      },
      _sum: { amount: true },
    }),
  ]);

  const billedTotal = billed._sum.amount ?? 0;
  const collectedTotal = collected._sum.amount ?? 0;
  return {
    collectedToday: today._sum.amount ?? 0,
    billed: billedTotal,
    collected: collectedTotal,
    outstanding: billedTotal - collectedTotal,
  };
}
