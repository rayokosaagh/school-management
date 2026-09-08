import { TranslatedText } from "@/components/i18n/language-provider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { Callout } from "@/components/ui/page-shell";
import { formatBs } from "@/lib/date/bs";
import { getLedger } from "@/lib/assessment/exams";
import { getLetterhead } from "@/lib/registry/school";
import { PrintButton } from "./_components/print-button";

import { requirePage } from "@/lib/auth/guard";

export default async function PrintMarksheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; section?: string; student?: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/exams");

  const params = await searchParams;
  const examTermId = Number(params.exam);
  const sectionId = Number(params.section);
  if (!Number.isInteger(examTermId) || !Number.isInteger(sectionId)) notFound();

  const [ledger, school] = await Promise.all([
    getLedger(examTermId, sectionId).catch(() => null),
    getLetterhead(),
  ]);
  if (!ledger) notFound();

  const onlyStudent = Number(params.student);
  const students = Number.isInteger(onlyStudent)
    ? ledger.students.filter((s) => s.studentId === onlyStudent)
    : ledger.students;

  const hasPractical = ledger.offerings.some((o) => o.hasPractical);
  const className = `${ledger.section.grade.name} ${ledger.section.name}`;

  return (
    <div className="print-root mx-auto max-w-4xl space-y-6">
      {/* Controls belong on screen only; the printed page starts at the sheet. */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/dashboard/exams?exam=${examTermId}&section=${sectionId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /><TranslatedText>
          Back to exams
        </TranslatedText></Link>
        <PrintButton count={students.length} />
      </div>

      {!school.configured ? (
        <Callout icon={Info} tint="amber">
          <span className="no-print"><TranslatedText>
            The school name and address are not set, so the letterhead below is a
            placeholder. Fill them in on the Settings page before printing for real.
          </TranslatedText></span>
        </Callout>
      ) : null}

      {students.length === 0 ? (
        <Callout icon={Info} tint="amber"><TranslatedText>
          Nobody to print for this section.
        </TranslatedText></Callout>
      ) : null}

      {students.map((student) => (
        <article key={student.studentId} className="sheet">
          <header className="sheet-head">
            <h1>{school.name}</h1>
            {school.nameNp ? <p className="np">{school.nameNp}</p> : null}
            <p className="meta">
              {[school.address, school.phone, school.email].filter(Boolean).join(" · ")}
            </p>
            <h2>
              {ledger.term.name} — {ledger.section.academicYear.nameBS}
            </h2>
          </header>

          <dl className="sheet-facts">
            <div>
              <dt><TranslatedText>Name</TranslatedText></dt>
              <dd>{student.fullName}</dd>
            </div>
            <div>
              <dt><TranslatedText>Class</TranslatedText></dt>
              <dd>{className}</dd>
            </div>
            <div>
              <dt><TranslatedText>Roll no.</TranslatedText></dt>
              <dd>{student.rollNo}</dd>
            </div>
            <div>
              <dt><TranslatedText>Date</TranslatedText></dt>
              <dd>{formatBs(new Date(), "YYYY-MM-DD")}</dd>
            </div>
          </dl>

          <table className="sheet-table">
            <thead>
              <tr>
                <th className="left"><TranslatedText>Subject</TranslatedText></th>
                <th><TranslatedText>Theory</TranslatedText></th>
                {hasPractical ? <th><TranslatedText>Practical</TranslatedText></th> : null}
                <th><TranslatedText>Total</TranslatedText></th>
                <th><TranslatedText>Full</TranslatedText></th>
                <th><TranslatedText>Grade</TranslatedText></th>
                <th className="left"><TranslatedText>Remarks</TranslatedText></th>
              </tr>
            </thead>
            <tbody>
              {student.subjects.map((s) => (
                <tr key={s.offeringId}>
                  <td className="left">{s.subject}</td>
                  <td>{s.result.isAbsent ? "Ab" : (s.result.theory ?? "—")}</td>
                  {hasPractical ? (
                    <td>{s.result.isAbsent ? "Ab" : (s.result.practical ?? "—")}</td>
                  ) : null}
                  <td>{s.result.total ?? "—"}</td>
                  <td>{s.result.fullMarks}</td>
                  <td>{s.result.grade?.letter ?? "—"}</td>
                  <td className="left small">
                    <TranslatedText>{s.result.isAbsent
                      ? "Absent"
                      : s.result.failedParts.length > 0
                        ? `Failed ${s.result.failedParts.join(" and ")}`
                        : s.result.total === null
                          ? "Not marked"
                          : ""}</TranslatedText>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="sheet-summary">
            <div>
              <dt><TranslatedText>Total</TranslatedText></dt>
              <dd>{student.grandTotal ?? "—"}</dd>
            </div>
            <div>
              <dt><TranslatedText>Percentage</TranslatedText></dt>
              <dd>
                <TranslatedText>{student.overall.percent === null ? "—" : `${student.overall.percent}%`}</TranslatedText>
              </dd>
            </div>
            <div>
              <dt><TranslatedText>GPA</TranslatedText></dt>
              <dd>
                {student.overall.gpa === null ? "—" : student.overall.gpa.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt><TranslatedText>Position</TranslatedText></dt>
              <dd>
                <TranslatedText>{student.position === null
                  ? "—"
                  : `${student.position} of ${ledger.students.length}`}</TranslatedText>
              </dd>
            </div>
            <div>
              <dt><TranslatedText>Result</TranslatedText></dt>
              <dd>
                <TranslatedText>{!student.overall.complete
                  ? "Pending"
                  : student.overall.passedAll
                    ? "Passed"
                    : "Failed"}</TranslatedText>
              </dd>
            </div>
          </dl>

          {!ledger.term.isPublished ? (
            <p className="draft-note"><TranslatedText>
              Draft — this exam has not been published.
            </TranslatedText></p>
          ) : null}

          <div className="sheet-signs">
            <span><TranslatedText>Class Teacher</TranslatedText></span>
            <span><TranslatedText>Checked By</TranslatedText></span>
            <span><TranslatedText>Principal</TranslatedText></span>
          </div>
        </article>
      ))}
    </div>
  );
}
