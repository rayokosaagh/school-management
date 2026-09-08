"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ClipboardCheck, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { PersonName } from "@/components/ui/person-name";
import { cn } from "@/lib/utils";
import {
  RegisterTabs,
  registerTabId,
  type RegisterTab,
} from "@/components/ui/register-tabs";
import { Segmented } from "@/components/ui/segmented";
import { FieldSelect } from "@/components/ui/select";
import { designationCode, sectionCode } from "@/lib/register-codes";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { AddExamForm, ExamsView, type ExamRow } from "./exam-forms";
import { MarksGrid } from "./marks-grid";

// Exam, then section, then subject. Two register strips, outer then inner:
// the exam term, and under it the section being marked for it — the same
// section strip Attendance and Students navigate by, so a class is picked the
// same way on every page. Only the subject, which is local state rather than
// a navigation, stays in the toolbar.

type Term = { id: number; name: string; isPublished: boolean; marks: number };
type Section = { id: number; name: string; grade: { name: string } };
type Offering = { id: number; subjectName: string };

export type LedgerView = {
  termName: string;
  sectionLabel: string;
  termId: number;
  sectionId: number;
  /// tone: which --subject-N this column paints with — the same tone the
  /// Classes timetable and the Teaching table give this subject.
  offerings: { id: number; subject: string; tone: number }[];
  students: {
    studentId: number;
    rollNo: number;
    fullName: string;
    fullNameNp: string | null;
    cells: { offeringId: number; total: number | null; passed: boolean | null }[];
    grandTotal: number | null;
    gpa: number | null;
    position: number | null;
  }[];
};

export function ExamsWorkspace({
  terms,
  sections,
  offerings,
  examId,
  sectionId,
  initialOfferingId,
  sheets,
  sheetError,
  ledger,
  view,
  yearLabel,
  examRows,
  academicYearId,
}: {
  terms: Term[];
  sections: Section[];
  offerings: Offering[];
  examId: number | null;
  sectionId: number | null;
  initialOfferingId: number | null;
  /// One entry per subject the section sits for, keyed by offering id.
  sheets: Record<number, React.ComponentProps<typeof MarksGrid> | null>;
  sheetError: string | null;
  ledger: LedgerView | null;
  view: "marks" | "ledger" | "exams";
  yearLabel: string;
  examRows: ExamRow[];
  academicYearId: number;
}) {
  const router = useRouter();
  const baseId = useId();
  const sectionBaseId = useId();
  const panelId = `${baseId}-panel`;
  // Tab, section and view changes all re-fetch every subject's marks sheet
  // for the section (see page.tsx), so this is a real wait, not a formality —
  // `isPending` has to reach the body, or the old sheet just sits there
  // looking answered while a new one is on the way.
  const [isPending, startNavigation] = useTransition();
  const [chosenOfferingId, setOfferingId] = useState(initialOfferingId);

  /// Changing section navigates with `router.replace`, which re-renders without
  /// remounting — so the chosen subject survives into a grade that may not
  /// teach it, leaving the select showing a bare id and the sheet empty. Derive
  /// rather than sync: a subject the section does not sit for falls back to the
  /// one the server picked.
  const offeringId = offerings.some((o) => o.id === chosenOfferingId)
    ? chosenOfferingId
    : initialOfferingId;

  const sheet = offeringId == null ? null : (sheets[offeringId] ?? null);

  function go(patch: Record<string, string | number>) {
    const q = new URLSearchParams();
    q.set("exam", String(patch.exam ?? examId ?? ""));
    q.set("section", String(patch.section ?? sectionId ?? ""));
    q.set("view", String(patch.view ?? view));
    startNavigation(() => router.replace(`?${q.toString()}`, { scroll: false }));
  }

  const tabs: RegisterTab[] = terms.map((t) => ({
    id: String(t.id),
    code: designationCode(t.name),
    label: t.name,
    count: t.marks,
    empty: t.marks === 0,
  }));

  const sectionTabs: RegisterTab[] = sections.map((s) => ({
    id: String(s.id),
    code: sectionCode(s.grade.name, s.name),
    label: `${s.grade.name} ${s.name}`,
  }));

  const term = terms.find((t) => t.id === examId) ?? null;

  // Manage lists the exams themselves, which belong to no section — there the
  // strip would be a control with nothing to steer.
  const showSections = view !== "exams";

  // The panel is the tabpanel for both strips at once, so its accessible name
  // is both tabs — "First Terminal" and "Class 1 A". aria-labelledby takes a
  // list of ids, which is what makes one panel under two strips readable.
  const panelLabelledBy = [
    registerTabId(baseId, String(examId ?? "")),
    showSections ? registerTabId(sectionBaseId, String(sectionId ?? "")) : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PageFrame
      icon={<ClipboardCheck />}
      tint="amber"
      eyebrow="Assessment"
      title="Exams"
      meta={`${terms.length} exam${terms.length === 1 ? "" : "s"} · ${yearLabel}`}
      actions={
        <div className="flex items-center gap-2">
          <Segmented
            ariaLabel="View"
            value={view}
            onChange={(next) => go({ view: next })}
            options={[
              { value: "marks" as const, label: "Marks" },
              { value: "ledger" as const, label: "Ledger" },
              { value: "exams" as const, label: "Manage", count: terms.length },
            ]}
          />
          <Sheet>
            <SheetTrigger render={<Button size="sm" />}>
              <Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>
              New exam
            </TranslatedText></SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle><TranslatedText>Add an exam</TranslatedText></SheetTitle>
                <SheetDescription><TranslatedText>
                  First Terminal, Second Terminal, Final — in the order they are sat.
                </TranslatedText></SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <AddExamForm academicYearId={academicYearId} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs
          tabs={tabs}
          value={String(examId ?? "")}
          onChange={(id) => go({ exam: Number(id) })}
          ariaLabel="Exams"
          baseId={baseId}
          panelId={panelId}
        />
      </PageFrame.Tabs>

      {/* Set down from the exam strip rather than stacked flush against it,
          the gap the Fees page puts under its class tabs: the exam says which
          sitting, this says whose marks, and two strips touching read as one
          crowded row. */}
      {showSections ? (
        <PageFrame.Tabs className="mt-3">
          <RegisterTabs
            tabs={sectionTabs}
            value={String(sectionId ?? "")}
            // No `subject` here: go() only carries exam, section and view, so a
            // subject passed in was silently dropped. The subject is local state,
            // and the derivation above resets it when the section changes.
            onChange={(id) => go({ section: Number(id) })}
            ariaLabel="Sections"
            baseId={sectionBaseId}
            panelId={panelId}
          />
        </PageFrame.Tabs>
      ) : null}

      <PageFrame.Toolbar>
        {view === "marks" ? (
          <FieldSelect
            aria-label="Subject"
            value={offeringId ? String(offeringId) : ""}
            onValueChange={(next) => setOfferingId(Number(next))}
            className="h-8 w-52 shrink-0"
            options={offerings.map((o) => ({
              value: String(o.id),
              label: o.subjectName,
            }))}
          />
        ) : null}
        <span className="flex-1" />
        {view === "ledger" && ledger ? (
          <>
            <Button
              render={
                <a
                  href={`/api/export/ledger?exam=${ledger.termId}&section=${ledger.sectionId}`}
                  download
                />
              }
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              <Download data-icon="inline-start" aria-hidden="true" /><TranslatedText>
              CSV
            </TranslatedText></Button>
            <Button
              render={
                <Link
                  href={`/dashboard/exams/print?exam=${ledger.termId}&section=${ledger.sectionId}`}
                />
              }
              nativeButton={false}
              size="sm"
            >
              <Printer data-icon="inline-start" aria-hidden="true" /><TranslatedText>
              Print marksheets
            </TranslatedText></Button>
          </>
        ) : (
          <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
            <TranslatedText>{term?.isPublished ? "Published · unpublish to edit" : "Draft"}</TranslatedText>
          </span>
        )}
      </PageFrame.Toolbar>

      <PageFrame.Body id={panelId} labelledBy={panelLabelledBy}>
        <div
          aria-busy={isPending}
          className={cn(
            "bg-surface border-line min-h-0 flex-1 overflow-auto rounded-[10px] border p-4 transition-opacity",
            isPending && "opacity-60",
          )}
        >
          {view === "exams" ? (
            <ExamsView rows={examRows} />
          ) : view === "ledger" ? (
            ledger && ledger.students.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-3 border-line border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium"><TranslatedText>Roll</TranslatedText></th>
                    <th className="py-2 pr-3 font-medium"><TranslatedText>Name</TranslatedText></th>
                    {ledger.offerings.map((o) => (
                      <th key={o.id} className="relative py-2 pr-3 pl-3 font-medium whitespace-nowrap">
                        {/* The subject's own colour, same as the timetable and
                            Teaching tables: a 3px rule, not a fill. */}
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
                          style={{ background: `var(--subject-${o.tone})` }}
                        />
                        {o.subject}
                      </th>
                    ))}
                    <th className="py-2 pr-3 font-medium"><TranslatedText>Total</TranslatedText></th>
                    <th className="py-2 pr-3 font-medium"><TranslatedText>GPA</TranslatedText></th>
                    <th className="py-2 font-medium"><TranslatedText>Pos.</TranslatedText></th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.students.map((s) => (
                    <tr key={s.studentId} className="border-line border-b last:border-0">
                      <td className="py-1.5 pr-3 font-mono">{s.rollNo}</td>
                      <td className="py-1.5 pr-3">
                        <PersonName en={s.fullName} np={s.fullNameNp} />
                      </td>
                      {s.cells.map((cell) => (
                        <td key={cell.offeringId} className="py-1.5 pr-3 font-mono">
                          {cell.total === null ? (
                            <span className="text-ink-3">—</span>
                          ) : (
                            <span className={cell.passed === false ? "text-danger" : undefined}>
                              {cell.total}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-1.5 pr-3 font-mono">{s.grandTotal ?? "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">
                        {s.gpa === null ? "—" : s.gpa.toFixed(2)}
                      </td>
                      <td className="py-1.5 font-mono">{s.position ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                tint="amber"
                title="Nothing to show yet"
                description="Enter marks for this section before the ledger has anything to rank."
              />
            )
          ) : sheetError ? (
            <p className="text-warn text-sm">{sheetError}</p>
          ) : sheet && sheet.rows.length > 0 ? (
            // Keyed on what is being marked. MarksGrid seeds its draft from
            // `rows` in a useState initializer, which runs once per mount —
            // and changing exam, section or subject re-renders without
            // remounting. Unkeyed, every subject showed the first subject's
            // numbers and a new section showed blanks, and the draft is what
            // gets saved, so a save would have written them to the wrong
            // subject.
            <MarksGrid key={`${examId}-${sectionId}-${offeringId}`} {...sheet} />
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              tint="amber"
              title="No students to mark"
              description="Pick an exam, a section and a subject that has students enrolled."
            />
          )}
        </div>
      </PageFrame.Body>
    </PageFrame>
  );
}
