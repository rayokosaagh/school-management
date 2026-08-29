import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  CalendarRange,
  Check,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Info,
  Lightbulb,
  ListChecks,
  Printer,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  Callout,
  IconTile,
  PageHeader,
  SectionCard,
  type Tint,
} from "@/components/ui/page-shell";
import { AddPanel } from "@/components/ui/add-panel";
import { StatusPill } from "@/components/ui/record-table";
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
import { AddExamForm, ExamsView, type ExamRow } from "./_components/exam-forms";
import { MarksGrid } from "./_components/marks-grid";

import { requirePage } from "@/lib/auth/guard";

/// One step of the picker: a labelled row of choices.
function PickerStep({
  icon,
  tint,
  label,
  children,
}: {
  icon: LucideIcon;
  tint: Tint;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5 py-4">
      <div className="flex items-center gap-2.5">
        <IconTile icon={icon} tint={tint} size="sm" />
        <p className="font-medium">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; section?: string; subject?: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/exams");

  const params = await searchParams;
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader icon={ClipboardCheck} tint="rose" title="Exams" />
        <Callout icon={Info} tint="amber">
          Set a current academic year before creating exams.
        </Callout>
      </div>
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

  const examId = Number(params.exam);
  const selectedExam = terms.find((t) => t.id === examId) ?? terms[0] ?? null;
  const sectionId = Number(params.section);
  const selectedSection =
    sections.find((s) => s.id === sectionId) ?? sections[0] ?? null;

  // Only the subjects this section's grade is actually taught.
  const offerings = selectedSection
    ? (await listOfferings(currentYear.id)).filter(
        (o) => o.gradeId === selectedSection.gradeId,
      )
    : [];
  const subjectId = Number(params.subject);
  const selectedOffering =
    offerings.find((o) => o.id === subjectId) ?? offerings[0] ?? null;

  let sheet = null;
  let sheetError: string | null = null;
  if (selectedExam && selectedSection && selectedOffering) {
    try {
      sheet = await getMarksSheet(
        selectedExam.id,
        selectedSection.id,
        selectedOffering.id,
      );
    } catch (e) {
      sheetError =
        e instanceof AssessmentError ? e.message : "Could not load that sheet.";
    }
  }

  const ledger =
    selectedExam && selectedSection
      ? await getLedger(selectedExam.id, selectedSection.id).catch(() => null)
      : null;

  const linkFor = (patch: Record<string, number>) => {
    const q = new URLSearchParams();
    q.set("exam", String(patch.exam ?? selectedExam?.id ?? ""));
    q.set("section", String(patch.section ?? selectedSection?.id ?? ""));
    if (patch.subject) q.set("subject", String(patch.subject));
    return `/dashboard/exams?${q.toString()}`;
  };

  // Each step of the picker carries its own colour, so a glance says which of
  // the three choices is set and which is still open.
  const SELECTED: Record<Tint, string> = {
    blue: "bg-tint-blue-fg text-background",
    violet: "bg-tint-violet-fg text-background",
    green: "bg-tint-green-fg text-background",
    amber: "bg-tint-amber-fg text-background",
    rose: "bg-tint-rose-fg text-background",
  };

  const chip = (active: boolean, tint: Tint) =>
    [
      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
      "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
      active
        ? `${SELECTED[tint]} font-medium`
        : "border-input bg-surface hover:bg-muted border",
    ].join(" ");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={ClipboardCheck}
        tint="rose"
        title="Exams"
        meta={[
          `${terms.length} exam${terms.length === 1 ? "" : "s"} in ${currentYear.nameBS}`,
          `${terms.filter((t) => t.isPublished).length} published`,
        ]}
      />

      <AddPanel
        icon={ClipboardCheck}
        tint="rose"
        title="Add an exam"
        description="First Terminal, Second Terminal, Final — in the order they are sat."
        cta="New exam"
      >
        <AddExamForm academicYearId={currentYear.id} />
      </AddPanel>

      <ExamsView rows={examRows} />

      {terms.length === 0 ? (
        <Callout icon={Info} tint="amber">
          Add an exam above before entering marks.
        </Callout>
      ) : sections.length === 0 ? (
        <Callout icon={Info} tint="amber">
          Add a section on the Classes page before entering marks.
        </Callout>
      ) : (
        <>
          <SectionCard
            icon={ListChecks}
            tint="blue"
            title="Enter marks"
            description="Pick an exam, a section, then a subject."
            actions={
              <span className="bg-rail text-muted-foreground hidden items-center gap-2 rounded-xl px-3 py-2 text-sm sm:inline-flex">
                <Info className="size-4 shrink-0" aria-hidden="true" />
                Selections determine what you can enter
              </span>
            }
          >
            <div className="divide-border/60 -my-1 divide-y">
              <PickerStep icon={CalendarRange} tint="blue" label="Exam">
                {terms.map((t) => {
                  const active = t.id === selectedExam?.id;
                  return (
                    <Link key={t.id} href={linkFor({ exam: t.id })} className={chip(active, "blue")}>
                      {t.name}
                      {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </Link>
                  );
                })}
              </PickerStep>

              <PickerStep icon={GraduationCap} tint="violet" label="Section / Grade">
                {sections.map((s) => {
                  const active = s.id === selectedSection?.id;
                  return (
                    <Link
                      key={s.id}
                      href={linkFor({ section: s.id })}
                      className={chip(active, "violet")}
                    >
                      {s.grade.name} {s.name}
                      {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </Link>
                  );
                })}
              </PickerStep>

              <PickerStep icon={BookOpen} tint="green" label="Subject">
                {offerings.length > 0 ? (
                  offerings.map((o) => {
                    const active = o.id === selectedOffering?.id;
                    return (
                      <Link
                        key={o.id}
                        href={linkFor({ subject: o.id })}
                        className={chip(active, "green")}
                      >
                        {o.subject.name}
                        {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                      </Link>
                    );
                  })
                ) : (
                  <Callout icon={Info} tint="amber">
                    No subjects are offered to this grade. Add offerings on the
                    Subjects page.
                  </Callout>
                )}
              </PickerStep>
            </div>

            <div className="border-border/60 text-muted-foreground -mx-5 -mb-5 mt-5 flex items-center gap-2.5 border-t px-5 py-3 text-sm">
              <span className="bg-tint-amber text-tint-amber-fg grid size-6 shrink-0 place-items-center rounded-md">
                <Lightbulb className="size-3.5" aria-hidden="true" />
              </span>
              <span>
                <span className="text-foreground font-medium">Tip</span> — choose an
                exam, section and subject above to view students and enter marks.
              </span>
            </div>
          </SectionCard>

          {sheetError ? (
            <Callout icon={Info} tint="amber">
              {sheetError}
            </Callout>
          ) : sheet && selectedExam && selectedSection && selectedOffering ? (
            <SectionCard
              icon={FileSpreadsheet}
              tint="violet"
              title={`${sheet.section.grade.name} ${sheet.section.name} · ${sheet.offering.subject.name}`}
              description={`${selectedExam.name}${sheet.locked ? " · published" : ""}`}
              actions={
                sheet.locked ? <StatusPill tone="positive">Locked</StatusPill> : undefined
              }
            >
              {sheet.rows.length === 0 ? (
                <Callout icon={Info} tint="amber">
                  No active students are enrolled in this section.
                </Callout>
              ) : (
                <MarksGrid
                  // Its draft state is seeded from `rows`, so switching to
                  // another subject has to remount rather than keep the marks
                  // typed against the previous one.
                  key={`${selectedExam.id}-${selectedSection.id}-${selectedOffering.id}`}
                  examTermId={selectedExam.id}
                  sectionId={selectedSection.id}
                  subjectOfferingId={selectedOffering.id}
                  scheme={{
                    fullMarksTheory: selectedOffering.fullMarksTheory,
                    passMarksTheory: selectedOffering.passMarksTheory,
                    hasPractical: selectedOffering.hasPractical,
                    fullMarksPractical: selectedOffering.fullMarksPractical,
                    passMarksPractical: selectedOffering.passMarksPractical,
                  }}
                  rows={sheet.rows}
                  locked={sheet.locked}
                />
              )}
            </SectionCard>
          ) : null}

          {ledger && ledger.students.length > 0 ? (
            <SectionCard
              icon={Trophy}
              tint="amber"
              title={`Ledger · ${ledger.section.grade.name} ${ledger.section.name}`}
              description={`${ledger.term.name} · every subject, with GPA and position`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/export/ledger?exam=${ledger.term.id}&section=${ledger.section.id}`}
                    download
                    className="border-input bg-surface hover:bg-muted inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
                  >
                    <Download className="size-4" />
                    CSV
                  </a>
                  <Link
                    href={`/dashboard/exams/print?exam=${ledger.term.id}&section=${ledger.section.id}`}
                    className="bg-action text-action-foreground inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                  >
                    <Printer className="size-4" />
                    Print marksheets
                  </Link>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="py-2 pr-3 font-medium">Roll</th>
                      <th className="py-2 pr-3 font-medium">Name</th>
                      {ledger.offerings.map((o) => (
                        <th key={o.id} className="py-2 pr-3 font-medium whitespace-nowrap">
                          {o.code}
                        </th>
                      ))}
                      <th className="py-2 pr-3 font-medium">Total</th>
                      <th className="py-2 pr-3 font-medium">GPA</th>
                      <th className="py-2 font-medium">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.students.map((student) => (
                      <tr key={student.studentId} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 tabular-nums">{student.rollNo}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{student.fullName}</td>
                        {student.subjects.map((s) => (
                          <td key={s.offeringId} className="py-1.5 pr-3 tabular-nums">
                            {s.result.total === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span
                                className={
                                  s.result.passed === false
                                    ? "text-red-700 dark:text-red-400"
                                    : undefined
                                }
                              >
                                {s.result.total}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="py-1.5 pr-3 tabular-nums">
                          {student.grandTotal ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {student.overall.gpa === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            student.overall.gpa.toFixed(2)
                          )}
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {student.position ?? <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                A dash means the mark has not been entered. GPA and position appear
                only once every subject is in, so a partial result is never mistaken
                for a final one.
              </p>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
