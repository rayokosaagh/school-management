"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Search } from "lucide-react";
import { startTransition, useId, useMemo, useOptimistic, useState } from "react";
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
import { Segmented } from "@/components/ui/segmented";
import { useToastedActionState } from "@/components/ui/toast";
import { sectionCode } from "@/lib/register-codes";
import { assignSubjectTeacher, type ActionState } from "../actions";
import { TeacherLoadView } from "./teacher-load";
import type { LoadStaff } from "./load-summary";

export type TeachingRow = {
  /// Section and offering together identify one assignment slot.
  sectionId: number;
  offeringId: number;
  sectionLabel: string;
  subjectName: string;
  /// Which --subject-N this row's subject paints with — the same tone the
  /// Classes timetable assigns it, from subjectTones().
  tone: number;
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
  staff: LoadStaff[];
  yearLabel: string;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  // No deep link exists for this page, so the table always lands showing
  // every section's slots rather than an arbitrary first one.
  const [tab, setTab] = useState(ALL);
  const [query, setQuery] = useState("");
  const [showLoad, setShowLoad] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState(ALL);
  const [, assignAction] = useToastedActionState(assignSubjectTeacher, EMPTY);

  const slotKey = (row: TeachingRow) => `${row.sectionId}:${row.offeringId}`;

  // The server's own answer for every slot — what a dropdown shows once
  // nothing is in flight for it, and what an optimistic change reverts to if
  // `assignSubjectTeacher` rejects it (a stale offering, a staff row deleted
  // out from under the request). Recomputed from `rows`, so a revalidation
  // that actually changes a teacher is picked straight up.
  const baseAssignments = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) map[slotKey(r)] = r.staffId ? String(r.staffId) : "";
    return map;
  }, [rows]);

  // `useOptimistic` rather than a plain `useState`: a plain "written on
  // change, cleared on success" store still has nothing that runs on
  // *failure*, so a rejected assignment just sits there — the dropdown keeps
  // the teacher the server refused, the unassigned count and the load panel
  // both agree with the wrong picture, and nothing about a later revalidation
  // clears it. Optimistic state reverts to `baseAssignments` on its own once
  // the transition it was set in settles, success or not, which is exactly
  // "show the guess, then trust the server" without a manual undo path.
  const [chosen, setOptimisticChosen] = useOptimistic(
    baseAssignments,
    (state, patch: { key: string; value: string }) => ({ ...state, [patch.key]: patch.value }),
  );

  const teacherOptions = useMemo(
    () => [
      { value: "", label: "Unassigned" },
      ...staff.map((s) => ({ value: String(s.id), label: s.fullName })),
    ],
    [staff],
  );

  /// Saved on change: one dropdown per subject, and a toast already confirms.
  function assign(row: TeachingRow, next: string | null) {
    const data = new FormData();
    data.set("sectionId", String(row.sectionId));
    data.set("subjectOfferingId", String(row.offeringId));
    data.set("staffId", next ?? "");
    startTransition(() => {
      setOptimisticChosen({ key: slotKey(row), value: next ?? "" });
      assignAction(data);
    });
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
      const teacher = chosen[slotKey(r)] ?? String(r.staffId ?? "");
      if (teacherFilter === "unassigned" && teacher !== "") return false;
      if (teacherFilter !== ALL && teacherFilter !== "unassigned" && teacher !== teacherFilter) return false;
      if (q && !`${r.subjectName} ${r.sectionLabel}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, tab, query, teacherFilter, chosen]);

  const unassigned = visible.filter(
    (r) => (chosen[slotKey(r)] ?? (r.staffId ? String(r.staffId) : "")) === "",
  ).length;

  const currentSection = sections.find((s) => String(s.id) === tab) ?? null;

  const columns = useMemo<ColumnDef<TeachingRow, unknown>[]>(
    () => [
      {
        id: "subject",
        accessorKey: "subjectName",
        header: "Subject",
        enableHiding: false,
        cell: ({ row }) => (
          // The subject's own colour, carried across every table it appears
          // in — same 3px rule the timetable grid paints it with, not a fill.
          <span className="relative flex items-center gap-2 pl-3">
            <span
              aria-hidden="true"
              className="absolute inset-y-0.5 left-0 w-[3px] rounded-full"
              style={{ background: `var(--subject-${row.original.tone})` }}
            />
            <span className="font-medium">{row.original.subjectName}</span>
          </span>
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
          <span className="text-ink-2"><TranslatedText>{row.original.hasPractical ? "Yes" : "—"}</TranslatedText></span>
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
      icon={<ClipboardList />}
      tint="green"
      eyebrow="Timetable"
      title="Teaching"
      meta={`${rows.length} slots · ${yearLabel}`}
      actions={
        <Segmented
          value={showLoad ? "load" : "assignments"}
          onChange={(value) => setShowLoad(value === "load")}
          options={[{ value: "assignments", label: "Assignments" }, { value: "load", label: "Teacher load" }]}
          ariaLabel="Teaching view"
        />
      }
    >
      {showLoad ? (
        <PageFrame.Body>
          <TeacherLoadView rows={rows} staff={staff} chosen={chosen} onManage={(teacherId, sectionId) => {
            setTeacherFilter(teacherId);
            setTab(sectionId ? String(sectionId) : ALL);
            setQuery("");
            setShowLoad(false);
          }} />
        </PageFrame.Body>
      ) : (
        <>
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
        <FieldSelect
          value={teacherFilter}
          onValueChange={(value) => setTeacherFilter(value ?? ALL)}
          aria-label="Filter assignments by teacher"
          className="h-8 w-48 shrink-0"
          options={[
            { value: ALL, label: "All teachers" },
            { value: "unassigned", label: "Unassigned slots" },
            ...staff.map((person) => ({ value: String(person.id), label: person.fullName })),
          ]}
        />
        {teacherFilter !== ALL ? <Button variant="ghost" size="sm" onClick={() => setTeacherFilter(ALL)}><TranslatedText>Clear teacher filter</TranslatedText></Button> : null}
        {currentSection ? (
          <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap"><TranslatedText>
            Class teacher:</TranslatedText><TranslatedText>{" "}</TranslatedText>
          {currentSection.classTeacher ?? "not set"}
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          {visible.length}<TranslatedText> subject</TranslatedText><TranslatedText>{visible.length === 1 ? "" : "s"}</TranslatedText>
          <TranslatedText>{unassigned > 0 ? ` · ${unassigned} unassigned` : ""}</TranslatedText>
        </span>
      </PageFrame.Toolbar>

        <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
          <DataTable<TeachingRow>
            id="teaching"
            columns={columns}
            rows={visible}
            getRowId={(r) => `${r.sectionId}:${r.offeringId}`}
            initialSort={[{ id: "subject", desc: false }]}
            empty={{
              icon: ClipboardList,
              tint: "green",
              title: rows.length === 0 ? "Nothing to assign yet" : "No subjects match",
              description:
                rows.length === 0
                  ? "Add subjects to a grade on the Subjects page first."
                  : "Try another section, teacher filter or search.",
            }}
          />
        </PageFrame.Body>
        </>
      )}
    </PageFrame>
  );
}
