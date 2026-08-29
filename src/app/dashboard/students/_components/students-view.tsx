"use client";

import Link from "next/link";
import { Download, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordTable, StatusPill, type Tone } from "@/components/ui/record-table";
import { StudentDetail, type StudentDetailData } from "./student-detail";

export type StudentRow = StudentDetailData & {
  gradeName: string;
  rollNo: number;
  sectionLabel: string;
  dobLabel: string;
  guardianLabel: string;
};

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "positive",
  LEFT: "critical",
  GRADUATED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  LEFT: "Left",
  GRADUATED: "Graduated",
};

export function StudentsView({
  rows,
  sections,
  academicYearId,
}: {
  rows: StudentRow[];
  sections: { id: number; name: string; grade: { name: string } }[];
  academicYearId: number;
}) {
  // Grades come from the sections running this year, so the dropdown never
  // offers a class with nobody in it.
  const grades = [...new Set(sections.map((s) => s.grade.name))].sort();

  return (
    <RecordTable
      title="Roll"
      subtitle="Roll numbers restart in each section"
      rows={rows}
      getKey={(r) => r.studentId}
      getSearchText={(r) =>
        `${r.fullName} ${r.fullNameNp ?? ""} ${r.admissionNo} ${r.sectionLabel} ${r.guardianLabel}`
      }
      searchPlaceholder="Search name or admission no."
      filters={[
        {
          key: "grade",
          label: "Class",
          options: grades.map((g) => ({ value: g, label: g })),
          match: (r, v) => r.gradeName === v,
        },
        {
          key: "section",
          label: "Section",
          options: sections.map((s) => ({
            value: String(s.id),
            label: `${s.grade.name} ${s.name}`,
          })),
          match: (r, v) => String(r.sectionId) === v,
        },
        {
          key: "status",
          label: "Status",
          options: [
            { value: "ACTIVE", label: "Active" },
            { value: "LEFT", label: "Left" },
            { value: "GRADUATED", label: "Graduated" },
          ],
          match: (r, v) => r.status === v,
        },
      ]}
      empty="Nobody admitted yet."
      groupBy={{
        key: (r) => r.sectionLabel,
        label: (r) => r.sectionLabel,
        meta: (rows) => `${rows.length} student${rows.length === 1 ? "" : "s"}`,
      }}
      detailTitle={(r) => `${r.fullName} · ${r.sectionLabel}`}
      columns={[
        {
          key: "roll",
          header: "Roll",
          span: 1,
          render: (r) => <span className="tabular-nums">{r.rollNo}</span>,
        },
        {
          key: "name",
          header: "Name",
          span: 3,
          render: (r) => (
            <div className="min-w-0">
              <p className="truncate font-medium">{r.fullName}</p>
              {r.fullNameNp ? (
                <p className="text-muted-foreground truncate text-xs">{r.fullNameNp}</p>
              ) : null}
            </div>
          ),
        },
        {
          key: "class",
          header: "Class",
          span: 2,
          hideOnMobile: true,
          render: (r) => <span className="text-muted-foreground">{r.sectionLabel}</span>,
        },
        {
          key: "adm",
          header: "Admission",
          span: 2,
          hideOnMobile: true,
          render: (r) => <span className="tabular-nums">{r.admissionNo}</span>,
        },
        {
          key: "dob",
          header: "Born",
          span: 2,
          hideOnMobile: true,
          render: (r) => <span className="tabular-nums">{r.dobLabel}</span>,
        },
        {
          key: "status",
          header: "Status",
          span: 2,
          render: (r) => (
            <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>
              {STATUS_LABEL[r.status] ?? r.status}
            </StatusPill>
          ),
        },
      ]}
      actions={
        // A plain link, so the browser downloads it rather than the router
        // trying to navigate to a CSV.
        <a
          href="/api/export/students"
          download
          className="border-input bg-surface hover:bg-muted inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium"
        >
          <Download className="size-4" />
          Export CSV
        </a>
      }
      rowActions={(row, open) => (
        <>
          <Button
            render={<Link href={`/dashboard/students/${row.studentId}`} />}
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${row.fullName}'s profile`}
            title="Open profile"
          >
            <ExternalLink />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={open}
            aria-label={`Edit ${row.fullName}`}
            title="Edit"
          >
            <Pencil />
          </Button>
        </>
      )}
      renderDetail={(row, close) => (
        <>
          <Link
            href={`/dashboard/students/${row.studentId}`}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
          >
            <ExternalLink className="size-3.5" />
            Open full profile
          </Link>
        <StudentDetail
          data={row}
          sections={sections}
          academicYearId={academicYearId}
          onDone={close}
        />
        </>
      )}
    />
  );
}
