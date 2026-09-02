import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBs, toBsInput } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSections } from "@/lib/registry/structure";
import { listOfferings } from "@/lib/registry/subjects";
import {
  AssessmentError,
  getLedger,
  getMarksSheet,
  listExamTerms,
} from "@/lib/assessment/exams";
import type { ExamRow } from "./_components/exam-forms";
import {
  ExamsWorkspace,
  type LedgerView,
} from "./_components/exams-workspace";

import { requirePage } from "@/lib/auth/guard";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    exam?: string;
    section?: string;
    subject?: string;
    view?: string;
  }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/exams");

  const params = await searchParams;
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No academic year is current"
        description="Set one on the Classes page before creating exams."
      />
    );
  }

  const [terms, sections] = await Promise.all([
    listExamTerms(currentYear.id),
    listSections(currentYear.id),
  ]);

  const examRows: ExamRow[] = terms.map((t) => ({
    id: t.id,
    name: t.name,
    order: t.order,
    startsBs: t.startsOn ? toBsInput(t.startsOn) : "",
    endsBs: t.endsOn ? toBsInput(t.endsOn) : "",
    span:
      t.startsOn && t.endsOn
        ? `${formatBs(t.startsOn, "YYYY-MM-DD")} → ${formatBs(t.endsOn, "YYYY-MM-DD")}`
        : t.startsOn
          ? formatBs(t.startsOn, "YYYY-MM-DD")
          : "Not scheduled",
    isPublished: t.isPublished,
    marks: t._count.marks,
  }));

  if (terms.length === 0 || sections.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title={terms.length === 0 ? "No exams yet" : "No sections yet"}
        description={
          terms.length === 0
            ? "Add an exam term for this year before entering marks."
            : "Add a section on the Classes page before entering marks."
        }
      />
    );
  }

  const selectedExam =
    terms.find((t) => t.id === Number(params.exam)) ?? terms[0];
  const selectedSection =
    sections.find((s) => s.id === Number(params.section)) ?? sections[0];

  // Only the subjects this section's grade is actually taught.
  const offerings = (await listOfferings(currentYear.id)).filter(
    (o) => o.gradeId === selectedSection.gradeId,
  );
  const selectedOffering =
    offerings.find((o) => o.id === Number(params.subject)) ?? offerings[0] ?? null;

  const view =
    params.view === "ledger" || params.view === "exams" ? params.view : "marks";

  // Every subject this section sits for, so switching subject is local state
  // rather than a navigation. One exam and one section at a time keeps it small.
  const loadedSheets = await Promise.all(
    offerings.map(async (o) => {
      try {
        const loaded = await getMarksSheet(selectedExam.id, selectedSection.id, o.id);
        return {
          id: o.id,
          error: null as string | null,
          sheet: {
            examTermId: selectedExam.id,
            sectionId: selectedSection.id,
            subjectOfferingId: o.id,
            // The mark scheme lives on the offering, not the sheet.
            scheme: {
              fullMarksTheory: loaded.offering.fullMarksTheory,
              passMarksTheory: loaded.offering.passMarksTheory,
              hasPractical: loaded.offering.hasPractical,
              fullMarksPractical: loaded.offering.fullMarksPractical,
              passMarksPractical: loaded.offering.passMarksPractical,
            },
            rows: loaded.rows,
            locked: loaded.locked,
          },
        };
      } catch (e) {
        return {
          id: o.id,
          sheet: null,
          error:
            e instanceof AssessmentError ? e.message : "Could not load that sheet.",
        };
      }
    }),
  );
  const sheets = Object.fromEntries(loadedSheets.map((l) => [l.id, l.sheet]));
  // Only the subject on screen gets to report its failure.
  const sheetError =
    loadedSheets.find((l) => l.id === selectedOffering?.id)?.error ?? null;

  const raw =
    view === "ledger"
      ? await getLedger(selectedExam.id, selectedSection.id).catch(() => null)
      : null;

  const ledger: LedgerView | null = raw
    ? {
        termId: raw.term.id,
        sectionId: raw.section.id,
        termName: raw.term.name,
        sectionLabel: `${raw.section.grade.name} ${raw.section.name}`,
        offerings: raw.offerings.map((o) => ({ id: o.id, subject: o.name })),
        students: raw.students.map((s) => ({
          studentId: s.studentId,
          rollNo: s.rollNo,
          fullName: s.fullName,
          cells: s.subjects.map((x) => ({
            offeringId: x.offeringId,
            total: x.result.total,
            passed: x.result.passed ?? null,
          })),
          grandTotal: s.grandTotal,
          gpa: s.overall.gpa,
          position: s.position,
        })),
      }
    : null;

  return (
    <ExamsWorkspace
      terms={terms.map((t) => ({
        id: t.id,
        name: t.name,
        isPublished: t.isPublished,
        marks: t._count.marks,
      }))}
      sections={sections.map((s) => ({
        id: s.id,
        name: s.name,
        grade: { name: s.grade.name },
      }))}
      offerings={offerings.map((o) => ({ id: o.id, subjectName: o.subject.name }))}
      examId={selectedExam.id}
      sectionId={selectedSection.id}
      initialOfferingId={selectedOffering?.id ?? null}
      sheets={sheets}
      sheetError={sheetError}
      ledger={ledger}
      view={view}
      yearLabel={currentYear.nameBS}
      examRows={examRows}
      academicYearId={currentYear.id}
    />
  );
}
