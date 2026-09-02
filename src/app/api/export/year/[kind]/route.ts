import { auth } from "@/lib/auth/auth";
import { currentActor } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import { csvResponse, safeText, toCsv, type Cell } from "@/lib/export/csv";
import { formatBs } from "@/lib/date/bs";
import { prisma } from "@/lib/prisma";

const STATUS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
};

/// Register: one row per enrolled student, ordered the way a printed register
/// is read — grade, then section, then roll.
async function registerCsv(academicYearId: number) {
  const enrollments = await prisma.enrollment.findMany({
    where: { academicYearId },
    include: { student: true, section: { include: { grade: true } } },
    orderBy: [
      { section: { grade: { order: "asc" } } },
      { section: { name: "asc" } },
      { rollNo: "asc" },
    ],
  });

  const rows: Cell[][] = enrollments.map((e) => [
    safeText(e.student.admissionNo),
    safeText(e.student.fullName),
    safeText(e.section.grade.name),
    safeText(e.section.name),
    e.rollNo,
  ]);

  return toCsv(["Admission No", "Name", "Grade", "Section", "Roll"], rows);
}

/// Attendance: one row per attendance record, ordered by date, section, then
/// roll. A record carries no roll number of its own — it names a session and
/// a student — so the year's enrolments are loaded once to look one up.
async function attendanceCsv(academicYearId: number) {
  // `Enrollment` is unique on (studentId, academicYearId) — one section per
  // student per year — so a student's roll is looked up by id alone.
  const enrollments = await prisma.enrollment.findMany({
    where: { academicYearId },
    select: { studentId: true, rollNo: true },
  });
  const rollNoByStudent = new Map(enrollments.map((e) => [e.studentId, e.rollNo]));

  const sessions = await prisma.attendanceSession.findMany({
    where: { academicYearId },
    include: {
      section: { include: { grade: true } },
      records: { include: { student: true } },
    },
    orderBy: [
      { date: "asc" },
      { section: { name: "asc" } },
    ],
  });

  const rows: Cell[][] = sessions.flatMap((session) =>
    [...session.records]
      .sort(
        (a, b) =>
          (rollNoByStudent.get(a.studentId) ?? 0) - (rollNoByStudent.get(b.studentId) ?? 0),
      )
      .map((record): Cell[] => [
        formatBs(session.date, "YYYY-MM-DD"),
        safeText(session.section.grade.name),
        safeText(session.section.name),
        safeText(record.student.admissionNo),
        safeText(record.student.fullName),
        STATUS[record.status] ?? record.status,
      ]),
  );

  return toCsv(
    ["Date (BS)", "Grade", "Section", "Admission No", "Name", "Status"],
    rows,
  );
}

/// Marks: one row per mark, ordered by term then subject then roll.
async function marksCsv(academicYearId: number) {
  // Same one-enrolment-per-student-per-year fact as attendance: roll is
  // looked up by student id alone.
  const enrollments = await prisma.enrollment.findMany({
    where: { academicYearId },
    select: { studentId: true, rollNo: true },
  });
  const rollNoByStudent = new Map(enrollments.map((e) => [e.studentId, e.rollNo]));

  const marks = await prisma.mark.findMany({
    where: { examTerm: { academicYearId } },
    include: {
      examTerm: true,
      student: true,
      subjectOffering: { include: { subject: true } },
    },
  });

  // One composite sort — term, then subject, then roll — rather than layering
  // a second sort on Prisma's `orderBy`: a later single-key sort would only
  // preserve equal-key ties, not the earlier grouping.
  const rows: Cell[][] = [...marks]
    .sort((a, b) => {
      const term = a.examTerm.order - b.examTerm.order;
      if (term !== 0) return term;
      const subject = a.subjectOffering.subject.name.localeCompare(
        b.subjectOffering.subject.name,
      );
      if (subject !== 0) return subject;
      return (rollNoByStudent.get(a.studentId) ?? 0) - (rollNoByStudent.get(b.studentId) ?? 0);
    })
    .map((m) => [
      safeText(m.examTerm.name),
      safeText(m.subjectOffering.subject.name),
      safeText(m.student.admissionNo),
      safeText(m.student.fullName),
      m.isAbsent ? "" : (m.theory ?? ""),
      m.isAbsent ? "" : (m.practical ?? ""),
      m.isAbsent ? "Yes" : "No",
    ]);

  return toCsv(
    ["Exam Term", "Subject", "Admission No", "Name", "Theory", "Practical", "Absent"],
    rows,
  );
}

const BUILDERS: Record<string, (academicYearId: number) => Promise<string>> = {
  register: registerCsv,
  attendance: attendanceCsv,
  marks: marksCsv,
};

/// A pre-delete convenience download, not the restore mechanism — the restore
/// point captured elsewhere is what actually brings a deleted year back.
/// Gated on `manage:settings` specifically (not the exporter-page pattern this
/// otherwise follows) because it is only reached from the admin-only delete
/// dialog, not from a page any of those roles otherwise see.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const actor = await currentActor();
  if (!actor || !granted(await loadGrants(), actor.role, "manage:settings")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { kind } = await params;
  const build = BUILDERS[kind];
  if (!build) return new Response("Unknown export kind", { status: 400 });

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const academicYearId = Number(yearParam);
  if (!yearParam || !Number.isInteger(academicYearId)) {
    return new Response("A numeric year is required", { status: 400 });
  }

  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) return new Response("That academic year does not exist", { status: 404 });

  const csv = await build(academicYearId);
  return csvResponse(`${kind}-${year.nameBS}.csv`, csv);
}
