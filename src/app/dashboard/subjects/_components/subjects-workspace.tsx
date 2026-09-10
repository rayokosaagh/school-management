"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, FlaskConical, Library, NotebookPen, Plus, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageFrame } from "@/components/ui/page-frame";
import {
  RegisterTabs,
  registerTabId,
  type RegisterTab,
} from "@/components/ui/register-tabs";
import { Segmented } from "@/components/ui/segmented";
import { FieldSelect } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { shortGrade, shortGradeList } from "@/lib/registry/grade-label";
import { AddOfferingForm, AddSubjectForm } from "./subjects-forms";
import { CODE } from "@/lib/record-code";
import {
  OfferingDetail,
  SubjectDetail,
  type OfferingRow,
  type SubjectRow,
} from "./subjects-view";

// Two jobs: the school's subject list, and which grade is taught what.

const ALL = "all";

export function SubjectsWorkspace({
  subjects,
  offerings,
  grades,
  academicYearId,
  yearLabel,
}: {
  subjects: SubjectRow[];
  offerings: OfferingRow[];
  grades: { id: number; name: string }[];
  academicYearId: number | null;
  yearLabel: string;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  const [view, setView] = useState<"subjects" | "curriculum">("subjects");
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [editingSubject, setEditingSubject] = useState<SubjectRow | null>(null);
  const [editingOffering, setEditingOffering] = useState<OfferingRow | null>(null);

  const gradeNames = useMemo(
    () => [...new Set(offerings.map((o) => o.gradeName))],
    [offerings],
  );

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<string, number>();
    for (const o of offerings) counts.set(o.gradeName, (counts.get(o.gradeName) ?? 0) + 1);
    return [
      { id: ALL, code: "ALL", label: "All grades", count: offerings.length },
      ...gradeNames.map((name) => {
        const n = counts.get(name) ?? 0;
        return { id: name, code: shortGrade(name), label: name, count: n, empty: n === 0 };
      }),
    ];
  }, [offerings, gradeNames]);

  const visibleSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subjects.filter(
      (s) => q === "" || s.name.toLowerCase().includes(q),
    );
  }, [subjects, query]);

  const visibleOfferings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offerings.filter((o) => {
      if (tab !== ALL && o.gradeName !== tab) return false;
      if (q && !`${o.subjectName} ${o.gradeName}`.toLowerCase().includes(q))
        return false;
      if (kind === "practical" && !o.hasPractical) return false;
      if (kind === "theory" && o.hasPractical) return false;
      return true;
    });
  }, [offerings, tab, query, kind]);

  const subjectColumns = useMemo<ColumnDef<SubjectRow, unknown>[]>(
    () => [
      {
        id: "recordId",
        accessorFn: (row) => row.id,
        header: "ID",
        meta: { mono: true, width: "96px" } satisfies ColumnMeta,
        cell: ({ row }) => <span className="text-ink-3">{CODE.subject(row.original.id)}</span>,
      },
      {
        id: "name",
        accessorKey: "name",
        header: "Subject",
        enableHiding: false,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "offered",
        header: "Offered in",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-ink-2 font-mono text-xs">
            {row.original.gradeNames && row.original.gradeNames.length > 0
              ? shortGradeList(row.original.gradeNames)
              : "—"}
          </span>
        ),
      },
      {
        id: "count",
        accessorKey: "offerings",
        // Counts offerings, one per section — Compulsory Math in every section
        // reads 24 against the ten grades listed beside it, so "Grades" was
        // the wrong word for the column.
        header: "Sections",
        meta: { numeric: true, mono: true, width: "88px" } satisfies ColumnMeta,
      },
    ],
    [],
  );

  const offeringColumns = useMemo<ColumnDef<OfferingRow, unknown>[]>(
    () => [
      {
        id: "subject",
        accessorKey: "subjectName",
        header: "Subject",
        enableHiding: false,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.subjectName}</span>
        ),
      },
      ...(tab === ALL
        ? [
            {
              id: "grade",
              accessorKey: "gradeName",
              header: "Grade",
              cell: ({ getValue }) => (
                <span className="text-ink-2">{String(getValue())}</span>
              ),
            } as ColumnDef<OfferingRow, unknown>,
          ]
        : []),
      {
        id: "theory",
        header: "Theory",
        enableSorting: false,
        meta: { mono: true, width: "120px" } satisfies ColumnMeta,
        cell: ({ row }) => (
          <span>
            {row.original.passMarksTheory} / {row.original.fullMarksTheory}
          </span>
        ),
      },
      {
        id: "practical",
        header: "Practical",
        enableSorting: false,
        meta: { mono: true, width: "140px" } satisfies ColumnMeta,
        cell: ({ row }) =>
          row.original.hasPractical ? (
            <span className="flex items-center gap-1.5">
              <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
              {row.original.passMarksPractical} / {row.original.fullMarksPractical}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
    ],
    [tab],
  );

  return (
    <PageFrame
      icon={<NotebookPen />}
      tint="amber"
      eyebrow="Timetable"
      title="Subjects"
      meta={`${subjects.length} subjects, taught across ${offerings.length} grade offerings in ${yearLabel}`}
      actions={
        <div className="flex items-center gap-2">
          <Segmented
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: "subjects" as const, label: "Subjects", count: subjects.length },
              { value: "curriculum" as const, label: "Curriculum", count: offerings.length },
            ]}
          />
          <Sheet>
            <SheetTrigger render={<Button size="sm" />}>
              <Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>
              Add
            </TranslatedText></SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle><TranslatedText>Add a subject</TranslatedText></SheetTitle>
                <SheetDescription><TranslatedText>
                  A subject is school-wide; its marks are set per grade.
                </TranslatedText></SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-6">
                <AddSubjectForm />
                {academicYearId && subjects.length > 0 && grades.length > 0 ? (
                  <div className="border-line space-y-3 border-t pt-5">
                    <p className="text-sm font-medium"><TranslatedText>Add a subject to a grade</TranslatedText></p>
                    <AddOfferingForm
                      subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
                      grades={grades}
                      academicYearId={academicYearId}
                    />
                  </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      }
    >
      {view === "curriculum" ? (
        <PageFrame.Tabs>
          <RegisterTabs
            tabs={tabs}
            value={tab}
            onChange={setTab}
            ariaLabel="Grades"
            baseId={baseId}
            panelId={panelId}
          />
        </PageFrame.Tabs>
      ) : null}

      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subject"
            aria-label="Search subject"
            className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </label>
        {view === "curriculum" ? (
          <FieldSelect
            aria-label="Mark scheme"
            value={kind}
            onValueChange={(next) => setKind(next ?? "")}
            className="h-8 w-44 shrink-0"
            options={[
              { value: "", label: "All subjects" },
              { value: "practical", label: "Has practical" },
              { value: "theory", label: "Theory only" },
            ]}
          />
        ) : null}
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-label whitespace-nowrap">
          <TranslatedText>{view === "curriculum"
            ? `${visibleOfferings.length} taught`
            : `${visibleSubjects.length} subject${visibleSubjects.length === 1 ? "" : "s"}`}</TranslatedText>
        </span>
      </PageFrame.Toolbar>

      <PageFrame.Body
        id={view === "curriculum" ? panelId : undefined}
        labelledBy={view === "curriculum" ? registerTabId(baseId, tab) : undefined}
      >
        {view === "curriculum" ? (
          <DataTable<OfferingRow>
            id="curriculum"
            columns={offeringColumns}
            rows={visibleOfferings}
            getRowId={(r) => String(r.id)}
            onSelect={(row) => setEditingOffering(row)}
            initialSort={[{ id: "subject", desc: false }]}
            empty={{
              icon: BookOpen,
              tint: "amber",
              title: offerings.length === 0 ? "No curriculum yet" : "Nothing matches",
              description:
                offerings.length === 0
                  ? "Add a subject to a grade to start the curriculum."
                  : "Try another grade or search.",
            }}
          />
        ) : (
          <DataTable<SubjectRow>
            id="subjects"
            columns={subjectColumns}
            rows={visibleSubjects}
            getRowId={(r) => String(r.id)}
            onSelect={(row) => setEditingSubject(row)}
            initialSort={[{ id: "name", desc: false }]}
            empty={{
              icon: Library,
              tint: "amber",
              title: subjects.length === 0 ? "No subjects yet" : "Nothing matches",
              description:
                subjects.length === 0
                  ? "Add the first subject; it is reused across grades and years."
                  : "Try another search.",
            }}
          />
        )}
      </PageFrame.Body>

      <Modal
        open={editingSubject !== null}
        title={editingSubject?.name ?? ""}
        onClose={() => setEditingSubject(null)}
      >
        {editingSubject ? (
          <SubjectDetail
            key={editingSubject.id}
            row={editingSubject}
            onDone={() => setEditingSubject(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={editingOffering !== null}
        title={
          editingOffering
            ? `${editingOffering.gradeName} · ${editingOffering.subjectName}`
            : ""
        }
        onClose={() => setEditingOffering(null)}
      >
        {/* Keyed per offering: the panel holds its own state, and opening a
            second row must not inherit the first one's. */}
        {editingOffering ? (
          <OfferingDetail
            key={editingOffering.id}
            row={editingOffering}
            onDone={() => setEditingOffering(null)}
          />
        ) : null}
      </Modal>
    </PageFrame>
  );
}
