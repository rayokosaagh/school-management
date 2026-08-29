import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  GraduationCap,
  IdCard,
  Info,
  Phone,
  User,
  Users,
} from "lucide-react";
import { Callout, IconTile, SectionCard } from "@/components/ui/page-shell";
import { StatusPill, type Tone } from "@/components/ui/record-table";
import { adToBs, formatBs } from "@/lib/date/bs";
import { getStudent } from "@/lib/registry/students";
import { monthlyRegister, studentCalendar } from "@/lib/attendance/attendance";
import { getStudentMarksheets } from "@/lib/assessment/exams";
import { Marksheet } from "@/components/ui/marksheet";
import { AttendanceMap } from "@/components/ui/attendance-map";
import { prisma } from "@/lib/prisma";
import { StudentPhotoForm } from "./_components/photo-form";

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "positive",
  LEFT: "critical",
  GRADUATED: "neutral",
};

const RELATION_LABEL: Record<string, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  GUARDIAN: "Guardian",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs tracking-wider uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

import { requirePage } from "@/lib/auth/guard";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/students");

  const { id } = await params;
  const studentId = Number(id);
  if (!Number.isInteger(studentId)) notFound();

  const student = await getStudent(studentId);
  if (!student) notFound();

  const current = student.enrollments[0] ?? null;

  // This month's attendance for the section the student is currently in.
  const today = adToBs(new Date());
  const register = current
    ? await monthlyRegister(current.sectionId, today.year, today.month)
    : null;
  const mine = register?.rows.find((r) => r.studentId === student.id) ?? null;

  // The student's own year, one square per recorded day.
  const year = current?.academicYear ?? null;
  const personal = year
    ? await studentCalendar(student.id, year.startsOn, year.endsOn)
    : [];

  const RATE: Record<string, number> = {
    PRESENT: 1,
    LATE: 0.8,
    LEAVE: 0.4,
    ABSENT: 0,
  };
  const LABEL: Record<string, string> = {
    PRESENT: "present",
    LATE: "late",
    LEAVE: "on leave",
    ABSENT: "absent",
  };
  const mapDays = personal.map((d) => ({
    date: d.date,
    rate: RATE[d.status] ?? null,
    label: d.note ? `${LABEL[d.status]} — ${d.note}` : (LABEL[d.status] ?? d.status),
  }));

  const marksheets = await getStudentMarksheets(student.id);

  const recentLeave = await prisma.attendanceRecord.findMany({
    where: { studentId: student.id, status: "LEAVE" },
    orderBy: { session: { date: "desc" } },
    take: 5,
    include: { session: { select: { date: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link
        href="/dashboard/students"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        All students
      </Link>

      <header className="card-surface flex flex-wrap items-start gap-5 p-6">
        <StudentPhotoForm studentId={student.id} photoId={student.photoId} name={student.fullName} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{student.fullName}</h1>
          {student.fullNameNp ? (
            <p className="text-muted-foreground text-lg">{student.fullNameNp}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={STATUS_TONE[student.status] ?? "neutral"}>
              {student.status === "ACTIVE"
                ? "Active"
                : student.status === "LEFT"
                  ? "Left"
                  : "Graduated"}
            </StatusPill>
            <StatusPill>Admission {student.admissionNo}</StatusPill>
            <StatusPill>Student ID {student.id}</StatusPill>
            {current ? (
              <StatusPill>
                {current.section.grade.name} {current.section.name} · Roll {current.rollNo}
              </StatusPill>
            ) : (
              <StatusPill tone="warning">Not enrolled this year</StatusPill>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={IdCard} tint="violet" title="Personal details">
          <dl className="grid grid-cols-2 gap-4">
            <Field
              label="Student ID"
              value={<span className="font-mono">{student.id}</span>}
            />
            <Field
              label="Admission number"
              value={<span className="font-mono">{student.admissionNo}</span>}
            />
            <Field label="First name" value={student.firstName} />
            <Field label="Middle name" value={student.middleName} />
            <Field label="Last name" value={student.lastName} />
            <Field label="Name in Nepali" value={student.fullNameNp} />
            <Field
              label="Gender"
              value={
                student.gender === "MALE"
                  ? "Male"
                  : student.gender === "FEMALE"
                    ? "Female"
                    : "Other"
              }
            />
            <Field label="Date of birth" value={formatBs(student.dob, "YYYY MMMM DD")} />
            <Field label="Admitted on" value={formatBs(student.admittedOn, "YYYY MMMM DD")} />
            <Field label="Address" value={student.address} />
          </dl>
        </SectionCard>

        <SectionCard icon={Users} tint="blue" title="Guardians">
          {student.guardians.length === 0 ? (
            <Callout icon={Info} tint="amber">
              No guardian on record, so absence messages have nowhere to go.
            </Callout>
          ) : (
            <ul className="space-y-3">
              {student.guardians.map((g) => (
                <li key={g.id} className="flex items-start gap-3">
                  <IconTile icon={User} tint={g.isPrimary ? "green" : "blue"} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {g.fullName}
                      {g.isPrimary ? (
                        <span className="text-muted-foreground font-normal"> · primary</span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                      <span>{RELATION_LABEL[g.relation] ?? g.relation}</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Phone className="size-3" aria-hidden="true" />
                        {g.phone}
                      </span>
                      {g.occupation ? <span>{g.occupation}</span> : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={CalendarCheck}
          tint="green"
          title="Attendance this month"
          description={
            register
              ? `${register.daysTaken} day${register.daysTaken === 1 ? "" : "s"} recorded`
              : undefined
          }
        >
          {!mine ? (
            <Callout icon={Info} tint="amber">
              Nothing recorded for this student this month.
            </Callout>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: "Present", value: mine.present },
                  { label: "Absent", value: mine.absent },
                  { label: "Late", value: mine.late },
                  { label: "Leave", value: mine.leave },
                ].map((stat) => (
                  <div key={stat.label} className="bg-rail rounded-xl p-3">
                    <p className="text-xl font-bold tabular-nums">{stat.value}</p>
                    <p className="text-muted-foreground text-xs">{stat.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground mt-3 text-sm">
                {mine.percent}% attended. Late counts as attending; absent does not.
              </p>
            </>
          )}

          {year && mapDays.length > 0 ? (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">
                Day by day in {year.nameBS}
              </p>
              <AttendanceMap from={year.startsOn} to={year.endsOn} days={mapDays} />
            </div>
          ) : null}

          {recentLeave.length > 0 ? (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">Recent leave</p>
              <ul className="space-y-1.5">
                {recentLeave.map((record) => (
                  <li key={record.id} className="text-sm">
                    <span className="tabular-nums">
                      {formatBs(record.session.date, "YYYY-MM-DD")}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {record.note || "no reason given"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard icon={Users} tint="amber" title="Enrolment history">
          {student.enrollments.length === 0 ? (
            <Callout icon={Info} tint="amber">
              This student has never been enrolled.
            </Callout>
          ) : (
            <ul className="divide-y">
              {student.enrollments.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {e.section.grade.name} {e.section.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {e.academicYear.nameBS} · roll {e.rollNo}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        icon={GraduationCap}
        tint="rose"
        title="Marksheets"
        description={
          marksheets && marksheets.sheets.length > 0
            ? `${marksheets.sheets.length} exam${marksheets.sheets.length === 1 ? "" : "s"} with marks recorded`
            : undefined
        }
      >
        {!marksheets ? (
          <Callout icon={Info} tint="amber">
            Not enrolled in the current year, so there is nothing to mark.
          </Callout>
        ) : marksheets.sheets.length === 0 ? (
          <Callout icon={Info} tint="amber">
            No marks recorded yet. Enter them on the Exams page.
          </Callout>
        ) : (
          <div className="divide-y">
            {marksheets.sheets.map((sheet) => (
              <div key={sheet.term.id} className="py-5 first:pt-0 last:pb-0">
                <Marksheet
                  examName={sheet.term.name}
                  className={`${marksheets.enrolment.section.grade.name} ${marksheets.enrolment.section.name} · roll ${marksheets.enrolment.rollNo}`}
                  subjects={sheet.result.subjects}
                  overall={sheet.result.overall}
                  position={sheet.result.position}
                  classSize={sheet.classSize}
                  isPublished={sheet.term.isPublished}
                  // Show the practical column when any subject in the grade
                  // actually has one, rather than inferring it from the marks.
                  hasPractical={sheet.offerings.some((o) => o.hasPractical)}
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
