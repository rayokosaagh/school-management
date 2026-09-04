"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Search, Users, X } from "lucide-react";
import { startTransition, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import {
  RegisterTabs,
  registerTabId,
  type RegisterTab,
} from "@/components/ui/register-tabs";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { sectionCode } from "@/lib/register-codes";
import { assignSubjectTeacher, type ActionState } from "../actions";

export type TeachingRow = {
  /// Section and offering together identify one assignment slot.
  sectionId: number;
  offeringId: number;
  sectionLabel: string;
  subjectName: string;
  hasPractical: boolean;
  staffId: number | null;
};

type Section = {
  id: number;
  name: string;
  grade: { name: string };
  classTeacher: string | null;
};

const ALL = "all";
const EMPTY: ActionState = {};

export function TeachingWorkspace({
  rows,
  sections,
  staff,
  yearLabel,
}: {
  rows: TeachingRow[];
  sections: Section[];
  staff: { id: number; fullName: string }[];
  yearLabel: string;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  // No deep link exists for this page, so the table always lands showing
  // every section's slots rather than an arbitrary first one.
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState("");
  const [showLoad, setShowLoad] = useState(false);
  const [, assignAction] = useToastedActionState(assignSubjectTeacher, EMPTY);

  // Controlled, so revalidation feeding a new teacher down cannot fight an
  // uncontrolled select's initial value.
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const slotKey = (row: TeachingRow) => `${row.sectionId}:${row.offeringId}`;

  const teacherOptions = useMemo(
    () => [
      { value: "", label: "Unassigned" },
      ...staff.map((s) => ({ value: String(s.id), label: s.fullName })),
    ],
    [staff],
  );

  /// Saved on change: one dropdown per subject, and a toast already confirms.
  function assign(row: TeachingRow, next: string | null) {
    setChosen((prev) => ({ ...prev, [slotKey(row)]: next ?? "" }));
    const data = new FormData();
    data.set("sectionId", String(row.sectionId));
    data.set("subjectOfferingId", String(row.offeringId));
    data.set("staffId", next ?? "");
    startTransition(() => assignAction(data));
  }

  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.sectionId, (counts.get(r.sectionId) ?? 0) + 1);
    return [
      { id: ALL, code: "ALL", label: "All sections", count: rows.length },
      ...sections.map((s) => {
        const n = counts.get(s.id) ?? 0;
        return {
          id: String(s.id),
          code: sectionCode(s.grade.name, s.name),
          label: `${s.grade.name} ${s.name}`,
          count: n,
          empty: n === 0,
        };
      }),
    ];
  }, [rows, sections]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== ALL && String(r.sectionId) !== tab) return false;
      if (q && !`${r.subjectName} ${r.sectionLabel}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, tab, query]);

  const unassigned = visible.filter(
    (r) => (chosen[slotKey(r)] ?? (r.staffId ? String(r.staffId) : "")) === "",
  ).length;

  // Load per teacher is how workload gets argued about, so it stays one click
  // away rather than being dropped.
  const load = useMemo(() => {
    const byStaff = new Map<number, { name: string; items: string[] }>();
    for (const r of rows) {
      const id = Number(chosen[slotKey(r)] ?? (r.staffId ?? ""));
      if (!Number.isInteger(id) || id === 0) continue;
      const person = staff.find((s) => s.id === id);
      if (!person) continue;
      const entry = byStaff.get(id) ?? { name: person.fullName, items: [] };
      entry.items.push(`${r.sectionLabel} · ${r.subjectName}`);
      byStaff.set(id, entry);
    }
    return [...byStaff.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  }, [rows, staff, chosen]);

  const currentSection = sections.find((s) => String(s.id) === tab) ?? null;

  const columns = useMemo<ColumnDef<TeachingRow, unknown>[]>(
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
              id: "section",
              accessorKey: "sectionLabel",
              header: "Class",
              cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span>,
            } as ColumnDef<TeachingRow, unknown>,
          ]
        : []),
      {
        id: "practical",
        accessorKey: "hasPractical",
        header: "Practical",
        meta: { width: "96px" } satisfies ColumnMeta,
        cell: ({ row }) => (
          <span className="text-ink-2">{row.original.hasPractical ? "Yes" : "—"}</span>
        ),
      },
      {
        id: "teacher",
        header: "Teacher",
        enableSorting: false,
        meta: { width: "220px" } satisfies ColumnMeta,
        cell: ({ row }) => (
          <FieldSelect
            value={chosen[slotKey(row.original)] ?? (row.original.staffId ? String(row.original.staffId) : "")}
            onValueChange={(next) => assign(row.original, next)}
            aria-label={`Teacher for ${row.original.sectionLabel} ${row.original.subjectName}`}
            className="h-8 w-full rounded-lg"
            options={teacherOptions}
          />
        ),
      },
    ],
    // assign and slotKey are stable for a render; chosen drives the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, chosen, teacherOptions],
  );

  return (
    <PageFrame
      eyebrow="Timetable"
      title="Teaching"
      meta={`${rows.length} slots · ${yearLabel}`}
      actions={
        <Button
          type="button"
          variant={showLoad ? "secondary" : "outline"}
          size="sm"
          aria-pressed={showLoad}
          onClick={() => setShowLoad((v) => !v)}
        >
          <Users data-icon="inline-start" aria-hidden="true" />
          Teacher load
        </Button>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          ariaLabel="Sections"
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
            placeholder="Search subject"
            aria-label="Search subject"
            className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </label>
        {currentSection ? (
          <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
            Class teacher: {currentSection.classTeacher ?? "not set"}
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          {visible.length} subject{visible.length === 1 ? "" : "s"}
          {unassigned > 0 ? ` · ${unassigned} unassigned` : ""}
        </span>
      </PageFrame.Toolbar>

      <PageFrame.Split
        aside={
          showLoad ? (
            <div className="flex min-h-0 flex-col">
              <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-3">
                <p className="font-medium">Load per teacher</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowLoad(false)}
                  aria-label="Close teacher load"
                >
                  <X />
                </Button>
              </div>
              {load.length === 0 ? (
                <p className="text-ink-3 px-4 py-4 text-sm">Nothing assigned yet.</p>
              ) : (
                <ul className="divide-line divide-y">
                  {/* Keyed by staff id, not name: two people can share a name,
                      and one of them is not a duplicate of the other. */}
                  {load.map(([staffId, teacher]) => (
                    <li key={staffId} className="px-4 py-2.5">
                      <p className="text-sm font-medium">
                        {teacher.name}
                        <span className="text-ink-3 font-normal">
                          {" "}
                          · {teacher.items.length} subject
                          {teacher.items.length === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="text-ink-3 text-[11.5px] leading-snug">
                        {teacher.items.join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : undefined
        }
        asideTitle="Load per teacher"
        asideOpen={showLoad}
        onAsideClose={() => setShowLoad(false)}
      >
        <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
          <DataTable<TeachingRow>
            id="teaching"
            columns={columns}
            rows={visible}
            getRowId={(r) => `${r.sectionId}:${r.offeringId}`}
            initialSort={[{ id: "subject", desc: false }]}
            empty={{
              icon: ClipboardList,
              title: rows.length === 0 ? "Nothing to assign yet" : "No subjects match",
              description:
                rows.length === 0
                  ? "Add subjects to a grade on the Subjects page first."
                  : "Try another section or search.",
            }}
          />
        </PageFrame.Body>
      </PageFrame.Split>
    </PageFrame>
  );
}
