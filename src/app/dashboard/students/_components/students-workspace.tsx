"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef } from "@tanstack/react-table";
import { Download, GraduationCap, Plus, Search, Trophy, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useOptimistic, useState, useTransition } from "react";
import { AttendanceStrip, stripPercent, type DayStatus } from "@/components/ui/attendance-strip";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import { Segmented } from "@/components/ui/segmented";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusDot } from "@/components/ui/status-dot";
import { useToastedActionState } from "@/components/ui/toast";
import type { Honours } from "@/lib/honours/honours";
import { initialRegisterTab, sectionCode } from "@/lib/register-codes";
import type { StudentSummary } from "@/lib/registry/students";
import { removeStudent, type ActionState } from "../actions";
import { HonoursWorkspace } from "./honours-workspace";
import { StudentPane, StudentPaneSkeleton, STATUS_LABEL, STATUS_TONE } from "./student-pane";
import type { StudentDetailData } from "./student-detail";
import { AddStudentForm } from "./student-form";
import { studentCode } from "@/lib/record-code";

export type StudentRow = StudentDetailData & {
  rollNo: number;
  sectionLabel: string;
  dobLabel: string;
  guardianLabel: string;
  strip: DayStatus[];
};

type Section = { id: number; name: string; grade: { name: string } };

const ALL = "all";

const EMPTY: ActionState = {};

function DeleteRowButton({ row }: { row: StudentRow }) {
  const [, action, pending] = useToastedActionState(removeStudent, EMPTY);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="studentId" value={row.studentId} />
      <ConfirmSubmit icon size="xs" pending={pending} title={`Delete ${row.fullName}`} />
    </form>
  );
}

export function StudentsWorkspace({
  view,
  honours,
  rows,
  sections,
  academicYearId,
  yearLabel,
  suggestedAdmissionNo,
  selectedId,
  summary,
  notice,
}: {
  /** From `?view=`; "register" is the default so a bare visit is unchanged. */
  view: "register" | "honours";
  /** The ranking data for `view === "honours"`; null otherwise, since it is
   *  only fetched for the view that needs it. */
  honours: Honours | null;
  rows: StudentRow[];
  sections: Section[];
  academicYearId: number;
  yearLabel: string;
  suggestedAdmissionNo: string;
  /** From `?student=`; null when nothing is selected. */
  selectedId: number | null;
  /** The server-rendered summary for `selectedId`, or null while it is not loaded. */
  summary: StudentSummary | null;
  /** A one-line message about the last navigation, or null. Cleared by the
   *  next `router.replace` — both `select` and `clearSelection` do one. */
  notice: string | null;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  // The register/honours split lives in the URL, not local state, so it
  // survives a reload and is what the old /dashboard/honours now redirects
  // to. Switching drops `?student=`, which only means something in the
  // register.
  function switchView(next: "register" | "honours") {
    if (next === view) return;
    startNavigation(() => router.replace(next === "honours" ? "?view=honours" : "?", { scroll: false }));
  }

  // A deep link lands on the linked student's own section and status, so the
  // pane never opens over a table that has filtered its row away. With
  // nothing selected — the normal way this page is opened — the table shows
  // every section rather than an arbitrary first one.
  const linked = selectedId == null ? undefined : rows.find((r) => r.studentId === selectedId);
  const [tab, setTab] = useState<string>(() => initialRegisterTab(linked?.sectionId, ALL));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(linked?.status ?? "ACTIVE");
  const [addOpen, setAddOpen] = useState(false);

  // The URL owns the selection; this only runs ahead of it for the length of
  // the navigation, so arriving at a bare /dashboard/students clears the pane
  // instead of stranding it on the last row.
  const [optimisticId, setOptimisticId] = useOptimistic(selectedId);

  // The tab counts are taken after the status filter and before the search, so
  // the number on a tab is what switching to it would show — the toolbar count
  // agrees with the tab. Search stays out: it is meant to narrow within a tab,
  // not to renumber the strip on every keystroke.
  const inStatus = useMemo(
    () => rows.filter((r) => status === "" || r.status === status),
    [rows, status],
  );

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<number, number>();
    for (const r of inStatus) counts.set(r.sectionId, (counts.get(r.sectionId) ?? 0) + 1);
    return [
      { id: ALL, code: "ALL", label: "All sections", count: inStatus.length },
      ...sections.map((s) => {
        const n = counts.get(s.id) ?? 0;
        return { id: String(s.id), code: sectionCode(s.grade.name, s.name), label: `${s.grade.name} ${s.name}`, count: n, empty: n === 0 };
      }),
    ];
  }, [inStatus, sections]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inStatus.filter((r) => {
      if (tab !== ALL && String(r.sectionId) !== tab) return false;
      if (q && !`${r.fullName} ${r.fullNameNp ?? ""} ${r.admissionNo} ${r.guardianLabel}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inStatus, tab, query]);

  const selectedRow = optimisticId == null ? null : (rows.find((r) => r.studentId === optimisticId) ?? null);
  const summaryMatches = summary != null && summary.studentId === optimisticId;

  function select(row: StudentRow) {
    if (row.studentId === optimisticId) return;
    startNavigation(() => {
      setOptimisticId(row.studentId);
      router.replace(`?student=${row.studentId}`, { scroll: false });
    });
  }
  function clearSelection() {
    startNavigation(() => {
      setOptimisticId(null);
      router.replace("?", { scroll: false });
    });
  }

  const columns = useMemo<ColumnDef<StudentRow, unknown>[]>(() => {
    const rollColumn: ColumnDef<StudentRow, unknown> = {
      id: "rollNo",
      accessorKey: "rollNo",
      header: "Roll",
      enableHiding: false,
      meta: { numeric: true, mono: true, width: "64px" } satisfies ColumnMeta,
    };

    const recordIdColumn: ColumnDef<StudentRow, unknown> = {
      id: "recordId",
      // Sorted on the admission number itself, so the order matches the code
      // on screen. Numeric where it can be, so 9 comes before 10.
      accessorFn: (r) =>
        /^\d+$/.test(r.admissionNo.trim())
          ? Number(r.admissionNo)
          : Number.MAX_SAFE_INTEGER,
      header: "ID",
      enableHiding: false,
      meta: { mono: true, width: "96px" } satisfies ColumnMeta,
      cell: ({ row }) => (
        <span className="text-ink-3">{studentCode(row.original.admissionNo)}</span>
      ),
    };

    return [
      // Across every section the roll number repeats, so the unique id leads
      // and the roll follows; inside one section the roll is the natural first
      // column and the id steps back.
      ...(tab === ALL ? [recordIdColumn, rollColumn] : [rollColumn, recordIdColumn]),
      {
        id: "fullName", accessorKey: "fullName", header: "Name", enableHiding: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.fullName}
            {row.original.fullNameNp ? <span className="font-devanagari text-ink-3 block text-[11.5px] leading-tight font-normal">{row.original.fullNameNp}</span> : null}
          </span>
        ),
      },
      { id: "section", accessorKey: "sectionLabel", header: "Class", cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span> },
      { id: "dob", accessorKey: "dobLabel", header: "Born (BS)", meta: { mono: true } satisfies ColumnMeta },
      { id: "guardian", accessorKey: "guardianLabel", header: "Guardian", cell: ({ row }) => {
        const g = row.original.guardians.find((x) => x.isPrimary) ?? row.original.guardians[0];
        return g ? <>{g.fullName} <span className="text-ink-3">· {g.relation[0]}{g.relation.slice(1).toLowerCase()}</span></> : <span className="text-ink-3">—</span>;
      } },
      { id: "strip", header: "Last 14 days", enableSorting: false, cell: ({ row }) => <AttendanceStrip days={row.original.strip} percent={stripPercent(row.original.strip)} /> },
      { id: "status", accessorKey: "status", header: "Status", cell: ({ getValue }) => { const s = String(getValue()); return <StatusDot tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABEL[s] ?? s}</StatusDot>; } },
    ];
  }, [tab]);

  const currentTabLabel = tabs.find((t) => t.id === tab)?.label ?? "All sections";
  const exportHref = tab === ALL ? "/api/export/students" : `/api/export/students?section=${tab}`;

  const rankedCount =
    honours?.sections.reduce((n, s) => n + s.students.filter((st) => st.position !== null).length, 0) ??
    undefined;

  return (
    <PageFrame
      icon={<GraduationCap />}
      tint="green"
      eyebrow="People"
      title="Students"
      meta={`${rows.length} enrolled · ${yearLabel}`}
      actions={
        <>
          <Segmented
            ariaLabel="View"
            value={view}
            onChange={switchView}
            options={[
              { value: "register" as const, label: "Register", count: rows.length },
              { value: "honours" as const, label: "Honours", count: rankedCount },
            ]}
          />
          <Button variant="outline" nativeButton={false} render={<a href={exportHref} download />}>
            <Download data-icon="inline-start" aria-hidden="true" /><TranslatedText>
            Export CSV
          </TranslatedText></Button>
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button />}>
              <Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>
              Admit student
            </TranslatedText></SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle><TranslatedText>Admit a student</TranslatedText></SheetTitle>
                <SheetDescription><TranslatedText>Dates are entered in Bikram Sambat and stored as Gregorian.</TranslatedText></SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <AddStudentForm sections={sections} academicYearId={academicYearId} suggestedAdmissionNo={suggestedAdmissionNo} />
              </div>
            </SheetContent>
          </Sheet>
        </>
      }
    >
      {view === "honours" ? (
        !honours || honours.sections.length === 0 ? (
          <PageFrame.Body className="border-0 bg-transparent">
            <EmptyState
              icon={Trophy}
              title="No sections yet"
              description="Add a section on the Classes page and enrol students before ranking them."
              action={
                <Button nativeButton={false} render={<Link href="/dashboard/classes" />}><TranslatedText>
                  Go to Classes
                </TranslatedText></Button>
              }
            />
          </PageFrame.Body>
        ) : (
          <HonoursWorkspace honours={honours} />
        )
      ) : (
        <>
          <PageFrame.Tabs>
            <RegisterTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Sections" baseId={baseId} panelId={panelId} />
          </PageFrame.Tabs>

          <PageFrame.Toolbar>
            <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
              <Search className="size-3.5" aria-hidden="true" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${currentTabLabel}`} aria-label={`Search ${currentTabLabel}`} className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
            </label>
            <FieldSelect aria-label="Status" value={status} onValueChange={(v) => setStatus(v ?? "")} options={[{ value: "ACTIVE", label: "Status: Active" }, { value: "LEFT", label: "Status: Left" }, { value: "GRADUATED", label: "Status: Graduated" }, { value: "", label: "Status: Any" }]} className="h-8 w-44 shrink-0" />
            <span className="flex-1" />
            <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">{visible.length} <TranslatedText>{visible.length === 1 ? "student" : "students"}</TranslatedText><TranslatedText>{selectedRow ? " · 1 selected" : ""}</TranslatedText></span>
          </PageFrame.Toolbar>

          {notice ? (
            <p role="status" className="text-warn bg-warn-tint border-warn/30 mb-3 rounded-lg border px-3 py-2 text-sm">{notice}</p>
          ) : null}

          <PageFrame.Split
            aside={
              selectedRow ? (
                summaryMatches ? (
                  <StudentPane key={summary!.studentId} summary={summary!} detail={selectedRow} sections={sections} academicYearId={academicYearId} onClose={clearSelection} />
                ) : (
                  <StudentPaneSkeleton />
                )
              ) : undefined
            }
            asideTitle={selectedRow?.fullName ?? "Student"}
            asideOpen={selectedRow != null}
            onAsideClose={clearSelection}
          >
            <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
              <DataTable<StudentRow>
                id="students"
                columns={columns}
                rows={visible}
                getRowId={(r) => String(r.studentId)}
                selectedId={optimisticId == null ? null : String(optimisticId)}
                onSelect={select}
                rowActions={(row) => <DeleteRowButton row={row} />}
                initialSort={[{ id: "recordId", desc: false }]}
                empty={{
                  icon: rows.length === 0 ? UserPlus : GraduationCap,
                  tint: "green",
                  title: rows.length === 0 ? "No students admitted yet" : "No students match",
                  description: rows.length === 0 ? "Admit the first student to start the roll." : "Try another section, status or search.",
                  action: rows.length === 0 ? <Button onClick={() => setAddOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>Admit student</TranslatedText></Button> : undefined,
                }}
              />
            </PageFrame.Body>
          </PageFrame.Split>
        </>
      )}
    </PageFrame>
  );
}
