"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download, GraduationCap, Plus, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { AttendanceStrip, type DayStatus } from "@/components/ui/attendance-strip";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusDot } from "@/components/ui/status-dot";
import { useToastedActionState } from "@/components/ui/toast";
import type { StudentSummary } from "@/lib/registry/students";
import { removeStudent, type ActionState } from "../actions";
import { StudentPane, StudentPaneSkeleton } from "./student-pane";
import type { StudentDetailData } from "./student-detail";
import { AddStudentForm } from "./student-form";

export type StudentRow = StudentDetailData & {
  gradeName: string;
  rollNo: number;
  sectionLabel: string;
  dobLabel: string;
  guardianLabel: string;
  strip: DayStatus[];
};

type Section = { id: number; name: string; grade: { name: string } };

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", LEFT: "Left", GRADUATED: "Graduated" };
const STATUS_TONE: Record<string, "ok" | "neutral" | "warn"> = { ACTIVE: "ok", LEFT: "neutral", GRADUATED: "warn" };
const ALL = "all";

/// "Kindergarten A" → "KA", "Class 10 B" → "10B", "Senior Kindergarten A" → "SKA".
function sectionCode(gradeName: string, sectionName: string) {
  const num = gradeName.match(/\d+/)?.[0];
  const letters = num ? "" : gradeName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return `${num ?? letters}${sectionName.toUpperCase()}`;
}

function attendanceRate(strip: DayStatus[]) {
  const taken = strip.filter((d) => d !== "none");
  if (taken.length === 0) return null;
  return Math.round((taken.filter((d) => d === "present" || d === "late").length / taken.length) * 100);
}

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
  rows,
  sections,
  academicYearId,
  yearLabel,
  suggestedAdmissionNo,
  selectedId,
  summary,
}: {
  rows: StudentRow[];
  sections: Section[];
  academicYearId: number;
  yearLabel: string;
  suggestedAdmissionNo: string;
  /** From `?student=`; null when nothing is selected. */
  selectedId: number | null;
  /** The server-rendered summary for `selectedId`, or null while it is not loaded. */
  summary: StudentSummary | null;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  const initialTab = selectedId != null ? (rows.find((r) => r.studentId === selectedId)?.sectionId ?? ALL) : (sections[0]?.id ?? ALL);
  const [tab, setTab] = useState<string>(String(initialTab));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [optimisticId, setOptimisticId] = useState<number | null>(selectedId);
  const [addOpen, setAddOpen] = useState(false);

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.sectionId, (counts.get(r.sectionId) ?? 0) + 1);
    return [
      { id: ALL, code: "ALL", label: "All sections", count: rows.length },
      ...sections.map((s) => {
        const n = counts.get(s.id) ?? 0;
        return { id: String(s.id), code: sectionCode(s.grade.name, s.name), label: `${s.grade.name} ${s.name}`, count: n, empty: n === 0 };
      }),
    ];
  }, [rows, sections]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== ALL && String(r.sectionId) !== tab) return false;
      if (status !== "" && r.status !== status) return false;
      if (q && !`${r.fullName} ${r.fullNameNp ?? ""} ${r.admissionNo} ${r.guardianLabel}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, status, query]);

  const selectedRow = optimisticId == null ? null : (rows.find((r) => r.studentId === optimisticId) ?? null);
  const summaryMatches = summary != null && summary.studentId === optimisticId;

  function select(row: StudentRow) {
    setOptimisticId(row.studentId);
    startNavigation(() => router.replace(`?student=${row.studentId}`, { scroll: false }));
  }
  function clearSelection() {
    setOptimisticId(null);
    startNavigation(() => router.replace("?", { scroll: false }));
  }

  const columns = useMemo<ColumnDef<StudentRow, unknown>[]>(
    () => [
      { id: "rollNo", accessorKey: "rollNo", header: "Roll", enableHiding: false, meta: { numeric: true, mono: true, width: "64px" } satisfies ColumnMeta },
      {
        id: "fullName", accessorKey: "fullName", header: "Name", enableHiding: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.fullName}
            {row.original.fullNameNp ? <span className="font-devanagari text-ink-3 block text-[11.5px] leading-tight font-normal">{row.original.fullNameNp}</span> : null}
          </span>
        ),
      },
      { id: "section", accessorKey: "sectionLabel", header: "Section", cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span> },
      { id: "admissionNo", accessorKey: "admissionNo", header: "Admission", meta: { numeric: true, mono: true } satisfies ColumnMeta },
      { id: "dob", accessorKey: "dobLabel", header: "Born (BS)", meta: { mono: true } satisfies ColumnMeta },
      { id: "guardian", accessorKey: "guardianLabel", header: "Guardian", cell: ({ row }) => {
        const g = row.original.guardians.find((x) => x.isPrimary) ?? row.original.guardians[0];
        return g ? <>{g.fullName} <span className="text-ink-3">· {g.relation[0]}{g.relation.slice(1).toLowerCase()}</span></> : <span className="text-ink-3">—</span>;
      } },
      { id: "strip", header: "Last 14 days", enableSorting: false, cell: ({ row }) => <AttendanceStrip days={row.original.strip} percent={attendanceRate(row.original.strip)} /> },
      { id: "status", accessorKey: "status", header: "Status", cell: ({ getValue }) => { const s = String(getValue()); return <StatusDot tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABEL[s] ?? s}</StatusDot>; } },
    ],
    [],
  );

  const currentTabLabel = tabs.find((t) => t.id === tab)?.label ?? "All sections";
  const exportHref = tab === ALL ? "/api/export/students" : `/api/export/students?section=${tab}`;

  return (
    <PageFrame
      eyebrow="People"
      title="Students"
      meta={`${rows.length} enrolled · ${yearLabel}`}
      actions={
        <>
          <Button variant="outline" render={<a href={exportHref} download />}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Export CSV
          </Button>
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger render={<Button />}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Admit student
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Admit a student</SheetTitle>
                <SheetDescription>Dates are entered in Bikram Sambat and stored as Gregorian.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <AddStudentForm sections={sections} academicYearId={academicYearId} suggestedAdmissionNo={suggestedAdmissionNo} />
              </div>
            </SheetContent>
          </Sheet>
        </>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Sections" baseId={baseId} panelId={panelId} />
      </PageFrame.Tabs>

      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${currentTabLabel}`} aria-label={`Search ${currentTabLabel}`} className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </label>
        <FieldSelect aria-label="Status" value={status} onValueChange={(v) => setStatus(v ?? "")} options={[{ value: "ACTIVE", label: "Status: Active" }, { value: "LEFT", label: "Status: Left" }, { value: "GRADUATED", label: "Status: Graduated" }, { value: "", label: "Status: Any" }]} className="h-8" />
        <span className="flex-1" />
        <span className="text-ink-3 text-[12.5px]">{visible.length} {visible.length === 1 ? "student" : "students"}{selectedRow ? " · 1 selected" : ""}</span>
      </PageFrame.Toolbar>

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
            initialSort={[{ id: "rollNo", desc: false }]}
            empty={{
              icon: rows.length === 0 ? UserPlus : GraduationCap,
              title: rows.length === 0 ? "No students admitted yet" : "No students match",
              description: rows.length === 0 ? "Admit the first student to start the roll." : "Try another section, status or search.",
              action: rows.length === 0 ? <Button onClick={() => setAddOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" />Admit student</Button> : undefined,
            }}
          />
        </PageFrame.Body>
      </PageFrame.Split>
    </PageFrame>
  );
}
