"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  BookOpen,
  CalendarRange,
  Layers,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageFrame } from "@/components/ui/page-frame";
import {
  RegisterTabs,
  registerTabId,
  type RegisterTab,
} from "@/components/ui/register-tabs";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { FieldSelect } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToastedActionState } from "@/components/ui/toast";
import { shortGrade } from "@/lib/registry/grade-label";
import { assignClassTeacher } from "@/app/dashboard/teachers/actions";
import { AddGradeForm, AddSectionForm, AddYearForm } from "./classes-forms";
import { CODE } from "@/lib/record-code";
import {
  GradeDetail,
  SectionDetail,
  YearsView,
  type GradeRow,
  type SectionRow,
  type YearRow,
} from "./classes-view";
import { ReorderGradesDialog } from "./reorder-grades";
import { TeacherWeekView, TimetableEditView, type TimetableSlot } from "./timetable-embed";

export type { TimetableSlot } from "./timetable-embed";

const ALL = "all";

type View = "structure" | "years" | "timetable";

export function ClassesWorkspace({
  view,
  showStructure,
  showTimetable,
  years,
  grades,
  sections,
  staff,
  exams,
  academicYearId,
  yearLabel,
  timetable,
}: {
  /// From `?view=`; "structure" is the default so a bare visit is unchanged.
  /// Already resolved against what this actor may see — see classes/page.tsx
  /// — so it is never a view that would need hiding.
  view: View;
  /// manage:registry — gates Structure and Years together, as before.
  showStructure: boolean;
  /// manage:timetable, or a teacher's own week — see roles.ts's
  /// canOpenTimetableView. Independent of showStructure: a school that has
  /// customised the matrix could grant one without the other.
  showTimetable: boolean;
  years: YearRow[];
  grades: GradeRow[];
  sections: SectionRow[];
  staff: { id: number; fullName: string }[];
  exams: { id: number; name: string }[];
  academicYearId: number | null;
  yearLabel: string;
  timetable: TimetableSlot;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const router = useRouter();

  const ordered = useMemo(
    () => [...grades].sort((a, b) => a.order - b.order),
    [grades],
  );

  // The view lives in the URL, not local state, so it survives a reload and
  // is what the old /dashboard/timetable now redirects to. Switching drops
  // every other param — ?section=, ?teacher=, ?shape= — the same as Honours
  // dropping ?student= when Students switches away from the register.
  function switchView(next: View) {
    if (next === view) return;
    startTransition(() => {
      router.replace(next === "structure" ? "?" : `?view=${next}`, { scroll: false });
    });
  }

  // No deep link exists into Structure, so the table always lands showing
  // every grade's sections rather than an arbitrary first grade.
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState("");
  const [editingGrade, setEditingGrade] = useState<GradeRow | null>(null);
  const [editingSection, setEditingSection] = useState<SectionRow | null>(null);
  const [reorderingGrades, setReorderingGrades] = useState(false);
  const [, assignAction] = useToastedActionState(assignClassTeacher, {});

  // Controlled, so revalidation feeding a new teacher down cannot fight an
  // uncontrolled select's initial value.
  const [chosen, setChosen] = useState<Record<number, string>>({});

  const teacherOptions = useMemo(
    () => [
      { value: "", label: "No class teacher" },
      ...staff.map((s) => ({ value: String(s.id), label: s.fullName })),
    ],
    [staff],
  );

  function assign(sectionId: number, next: string | null) {
    setChosen((prev) => ({ ...prev, [sectionId]: next ?? "" }));
    const data = new FormData();
    data.set("sectionId", String(sectionId));
    data.set("classTeacherId", next ?? "");
    startTransition(() => assignAction(data));
  }

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<number, number>();
    for (const s of sections) counts.set(s.gradeId, (counts.get(s.gradeId) ?? 0) + 1);
    return [
      { id: ALL, code: "ALL", label: "All grades", count: sections.length },
      ...ordered.map((g) => {
        const n = counts.get(g.id) ?? 0;
        return {
          id: String(g.id),
          code: shortGrade(g.name),
          label: g.name,
          count: n,
          empty: n === 0,
        };
      }),
    ];
  }, [ordered, sections]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.filter((s) => {
      if (tab !== ALL && String(s.gradeId) !== tab) return false;
      if (q && !`${s.gradeName} ${s.name} ${s.classTeacher ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [sections, tab, query]);

  const grade = ordered.find((g) => String(g.id) === tab) ?? null;

  const columns = useMemo<ColumnDef<SectionRow, unknown>[]>(
    () => [
      {
        id: "recordId",
        accessorFn: (row) => row.id,
        header: "ID",
        meta: { mono: true, width: "96px" } satisfies ColumnMeta,
        cell: ({ row }) => <span className="text-ink-3">{CODE.section(row.original.id)}</span>,
      },
      {
        id: "section",
        accessorFn: (row) => `${row.gradeName} ${row.name}`,
        header: "Class",
        enableHiding: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.gradeName} {row.original.name}
          </span>
        ),
      },
      {
        id: "classTeacher",
        header: "Class teacher",
        enableSorting: false,
        meta: { width: "240px" } satisfies ColumnMeta,
        cell: ({ row }) => (
          <FieldSelect
            value={
              chosen[row.original.id] ??
              (row.original.classTeacherId ? String(row.original.classTeacherId) : "")
            }
            onValueChange={(next) => assign(row.original.id, next)}
            aria-label={`Class teacher for ${row.original.gradeName} ${row.original.name}`}
            className="h-8 w-full rounded-lg"
            options={teacherOptions}
          />
        ),
      },
      {
        id: "students",
        accessorKey: "students",
        header: "Students",
        meta: { numeric: true, mono: true, width: "96px" } satisfies ColumnMeta,
      },
    ],
    // assign is stable for a render; chosen drives the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen, teacherOptions],
  );

  // Only the tabs this actor can use: a school that has customised the matrix
  // could hold manage:registry without manage:timetable, a teacher's own
  // week without manage:registry, or both — see the props' own comments.
  // With one tab there is nothing to switch, so the strip does not show.
  const viewOptions: SegmentedOption<View>[] = [
    ...(showStructure
      ? [
          { value: "structure" as const, label: "Structure", count: sections.length },
          { value: "years" as const, label: "Years", count: years.length },
        ]
      : []),
    ...(showTimetable ? [{ value: "timetable" as const, label: "Timetable" }] : []),
  ];

  return (
    <PageFrame
      icon={BookOpen}
      tint="violet"
      eyebrow="Structure"
      title="Classes"
      meta={`${grades.length} grades · ${sections.length} sections · ${yearLabel}`}
      actions={
        <div className="flex items-center gap-2">
          {viewOptions.length > 1 ? (
            <Segmented ariaLabel="View" value={view} onChange={switchView} options={viewOptions} />
          ) : null}
          {showStructure ? (
            <Sheet>
              <SheetTrigger render={<Button size="sm" />}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                Add
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Add to the structure</SheetTitle>
                  <SheetDescription>
                    A grade is school-wide; its sections belong to one year.
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-6 px-4 pb-6">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">New academic year</p>
                    <AddYearForm />
                  </div>
                  <div className="border-line space-y-3 border-t pt-5">
                    <p className="text-sm font-medium">New grade</p>
                    <AddGradeForm />
                  </div>
                  {academicYearId ? (
                    <div className="border-line space-y-3 border-t pt-5">
                      <p className="text-sm font-medium">New section in {yearLabel}</p>
                      <AddSectionForm grades={grades} academicYearId={academicYearId} />
                    </div>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      }
    >
      {view === "timetable" ? (
        timetable.state === "edit" ? (
          <TimetableEditView {...timetable} />
        ) : timetable.state === "readonly" ? (
          <TeacherWeekView {...timetable} />
        ) : timetable.state === "no-year" ? (
          <PageFrame.Body>
            <EmptyState
              icon={CalendarRange}
              tint="violet"
              title="No academic year is current"
              description={
                showStructure
                  ? "Set one on the Years tab before building a timetable."
                  : "Nothing is scheduled until the school sets a current academic year."
              }
              action={
                showStructure ? (
                  <Button type="button" size="sm" onClick={() => switchView("years")}>
                    Go to Years
                  </Button>
                ) : undefined
              }
            />
          </PageFrame.Body>
        ) : // "unavailable": unreachable — page.tsx only resolves view to
          // "timetable" once canTimetable is true, and timetable is always
          // populated whenever canTimetable is true. Kept rather than
          // asserted so a future bug here fails quietly, not with a crash.
          null
      ) : view === "years" ? (
        <PageFrame.Body>
          <YearsView rows={years} />
        </PageFrame.Body>
      ) : (
        <>
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

          <PageFrame.Toolbar>
            <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
              <Search className="size-3.5" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search section or teacher"
                aria-label="Search section or teacher"
                className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              />
            </label>
            {grade ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingGrade(grade)}
              >
                <Pencil data-icon="inline-start" aria-hidden="true" />
                Edit {grade.name}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReorderingGrades(true)}
            >
              <ArrowUpDown data-icon="inline-start" aria-hidden="true" />
              Reorder grades
            </Button>
            <span className="flex-1" />
            <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
              {visible.length} section{visible.length === 1 ? "" : "s"}
            </span>
          </PageFrame.Toolbar>

          <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
            <DataTable<SectionRow>
              id="sections"
              columns={columns}
              rows={visible}
              getRowId={(r) => String(r.id)}
              onSelect={(row) => setEditingSection(row)}
              initialSort={[{ id: "section", desc: false }]}
              empty={{
                icon: sections.length === 0 ? Layers : BookOpen,
                tint: "violet",
                title: sections.length === 0 ? "No sections yet" : "No sections match",
                description:
                  sections.length === 0
                    ? "Add a grade, then a section for this year."
                    : "Try another grade or search.",
              }}
            />
          </PageFrame.Body>
        </>
      )}

      <Modal
        open={editingGrade !== null}
        title={editingGrade?.name ?? ""}
        onClose={() => setEditingGrade(null)}
      >
        {editingGrade ? (
          <GradeDetail
            key={editingGrade.id}
            row={editingGrade}
            onDone={() => setEditingGrade(null)}
          />
        ) : null}
      </Modal>

      <ReorderGradesDialog
        grades={ordered}
        open={reorderingGrades}
        onClose={() => setReorderingGrades(false)}
      />

      <Modal
        open={editingSection !== null}
        title={
          editingSection ? `${editingSection.gradeName} ${editingSection.name}` : ""
        }
        onClose={() => setEditingSection(null)}
      >
        {editingSection ? (
          <SectionDetail
            key={editingSection.id}
            row={editingSection}
            exams={exams}
            onDone={() => setEditingSection(null)}
          />
        ) : null}
      </Modal>
    </PageFrame>
  );
}
