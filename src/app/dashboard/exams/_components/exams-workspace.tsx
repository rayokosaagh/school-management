"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ClipboardCheck, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
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

// Exam, then section, then subject. The exam is the tab strip; the two
// narrower choices sit in the toolbar beside it.

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

  const term = terms.find((t) => t.id === examId) ?? null;

  return (
    <PageFrame
      icon={ClipboardCheck}
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
              <Plus data-icon="inline-start" aria-hidden="true" />
              New exam
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Add an exam</SheetTitle>
                <SheetDescription>
                  First Terminal, Second Terminal, Final — in the order they are sat.
                </SheetDescription>
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

      <PageFrame.Toolbar>
        <FieldSelect
          aria-label="Section"
          value={sectionId ? String(sectionId) : ""}
          // No `subject` here: go() only carries exam, section and view, so a
          // subject passed in was silently dropped. The subject is local state,
          // and the derivation above resets it when the section changes.
          onValueChange={(next) => go({ section: Number(next) })}
          className="h-8 w-48 shrink-0"
          options={sections.map((s) => ({
            value: String(s.id),
            label: `${sectionCode(s.grade.name, s.name)} · ${s.grade.name} ${s.name}`,
          }))}
        />
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
              <Download data-icon="inline-start" aria-hidden="true" />
              CSV
            </Button>
            <Button
              render={
                <Link
                  href={`/dashboard/exams/print?exam=${ledger.termId}&section=${ledger.sectionId}`}
                />
              }
              nativeButton={false}
              size="sm"
            >
              <Printer data-icon="inline-start" aria-hidden="true" />
              Print marksheets
            </Button>
          </>
        ) : (
          <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
            {term?.isPublished ? "Published · unpublish to edit" : "Draft"}
          </span>
        )}
      </PageFrame.Toolbar>

      <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, String(examId ?? ""))}>
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
                    <th className="py-2 pr-3 font-medium">Roll</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
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
                    <th className="py-2 pr-3 font-medium">Total</th>
                    <th className="py-2 pr-3 font-medium">GPA</th>
                    <th className="py-2 font-medium">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.students.map((s) => (
                    <tr key={s.studentId} className="border-line border-b last:border-0">
                      <td className="py-1.5 pr-3 font-mono">{s.rollNo}</td>
                      <td className="py-1.5 pr-3">{s.fullName}</td>
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
