"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { PersonName } from "@/components/ui/person-name";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToastedActionState } from "@/components/ui/toast";
import { designationCode } from "@/lib/register-codes";
import type { StaffSummary } from "@/lib/registry/staff";
import { removeStaff, toggleStaffActive, type ActionState } from "../actions";
import { StaffPane, StaffPaneSkeleton, StaffStatus } from "./staff-pane";
import type { StaffRow } from "./staff-detail";
import { AddStaffForm } from "./teachers-forms";
import { CODE } from "@/lib/record-code";

const ALL = "all";
const EMPTY: ActionState = {};

function RowActions({ row }: { row: StaffRow }) {
  const [, toggle, toggling] = useToastedActionState(toggleStaffActive, EMPTY);
  const [, remove, removing] = useToastedActionState(removeStaff, EMPTY);
  // Deleting is refused server-side while they lead a section or hold a
  // subject; marking them inactive is the reversible route.
  const blocked = row.sectionsLed > 0 || row.assignments > 0;
  return (
    <>
      <form action={toggle} className="inline">
        <input type="hidden" name="staffId" value={row.id} />
        <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
        <Button type="submit" size="xs" variant="ghost" disabled={toggling} aria-label={row.isActive ? `Mark ${row.fullName} inactive` : `Mark ${row.fullName} active`}>
          <TranslatedText>{row.isActive ? "Deactivate" : "Activate"}</TranslatedText>
        </Button>
      </form>
      <form action={remove} className="inline">
        <input type="hidden" name="staffId" value={row.id} />
        <ConfirmSubmit icon size="xs" pending={removing} disabled={blocked} title={blocked ? "Remove class-teacher and subject assignments first" : `Delete ${row.fullName}`} />
      </form>
    </>
  );
}

export function StaffWorkspace({
  rows,
  selectedId,
  summary,
  canManageAccounts,
  yearLabel,
  ladder,
}: {
  rows: StaffRow[];
  /** From `?staff=`; null when nothing is selected. */
  selectedId: number | null;
  /** The server-rendered summary for `selectedId`, or null while it is not loaded. */
  summary: StaffSummary | null;
  /** Whether this account may reach Settings to create a sign-in. */
  canManageAccounts: boolean;
  /** The selected academic year, which the pane leads with. */
  yearLabel: string | null;
  /** Every grade running this year, in order, for the teaching-load bar. */
  ladder: { name: string; code: string }[];
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  // A deep link lands on the linked staff member's own status, so the pane
  // never opens over a table that has filtered its row away.
  const linked = selectedId == null ? undefined : rows.find((r) => r.id === selectedId);

  const [tab, setTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(linked ? (linked.isActive ? "active" : "inactive") : "active");
  const [addOpen, setAddOpen] = useState(false);

  // The URL owns the selection; this only runs ahead of it for the length of
  // the navigation, so arriving at a bare /dashboard/teachers clears the pane
  // instead of stranding it on the last row.
  const [optimisticId, setOptimisticId] = useOptimistic(selectedId);

  // The tab counts are taken after the status filter and before the search, so
  // the number on a tab is what switching to it would show — the toolbar count
  // agrees with the tab. Search stays out: it narrows within a tab.
  const inStatus = useMemo(
    () => rows.filter((r) => (status === "active" ? r.isActive : status === "inactive" ? !r.isActive : true)),
    [rows, status],
  );

  // Designation is free text in the data model, so the buckets are whatever
  // the school actually types, ordered by how many hold each.
  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<string, number>();
    for (const r of inStatus) { const d = r.designation.trim() || "Unspecified"; counts.set(d, (counts.get(d) ?? 0) + 1); }
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return [{ id: ALL, code: "ALL", label: "Everyone", count: inStatus.length }, ...groups.map(([d, n]) => ({ id: d, code: designationCode(d), label: d, count: n }))];
  }, [inStatus]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inStatus.filter((r) => {
      if (tab !== ALL && (r.designation.trim() || "Unspecified") !== tab) return false;
      if (q && !`${r.fullName} ${r.fullNameNp ?? ""} ${r.phone} ${r.designation}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inStatus, tab, query]);

  const selectedRow = optimisticId == null ? null : (rows.find((r) => r.id === optimisticId) ?? null);
  const summaryMatches = summary != null && summary.staffId === optimisticId;

  function select(row: StaffRow) {
    if (row.id === optimisticId) return;
    startNavigation(() => {
      setOptimisticId(row.id);
      router.replace(`?staff=${row.id}`, { scroll: false });
    });
  }
  function clearSelection() {
    startNavigation(() => {
      setOptimisticId(null);
      router.replace("?", { scroll: false });
    });
  }

  const columns = useMemo<ColumnDef<StaffRow, unknown>[]>(
    () => [
      { id: "recordId", accessorFn: (r) => r.id, header: "ID", meta: { mono: true, width: "96px" } satisfies ColumnMeta, cell: ({ row }) => <span className="text-ink-3">{CODE.staff(row.original.id)}</span> },
      { id: "fullName", accessorKey: "fullName", header: "Name", enableHiding: false, cell: ({ row }) => <PersonName en={row.original.fullName} np={row.original.fullNameNp} /> },
      { id: "designation", accessorKey: "designation", header: "Designation" },
      { id: "phone", accessorKey: "phone", header: "Phone", meta: { mono: true } satisfies ColumnMeta },
      // `assignments` counts subject-in-a-class pairings, not subjects: a
      // teacher taking one subject across fourteen classes has fourteen. It
      // read as "28 subjects" for somebody who teaches exactly one.
      // Sorted on sections first, classes as the tie-break — an explicit
      // comparator rather than folding the pair into one number.
      { id: "load", accessorFn: (r) => [r.sectionsLed, r.assignments], header: "Load",
        sortingFn: (a, b) => a.original.sectionsLed - b.original.sectionsLed || a.original.assignments - b.original.assignments,
        cell: ({ row }) => (
        <span className="text-ink-2">{row.original.sectionsLed} <TranslatedText>{row.original.sectionsLed === 1 ? "section" : "sections"}</TranslatedText> · {row.original.assignments} <TranslatedText>{row.original.assignments === 1 ? "class" : "classes"}</TranslatedText></span>
      ) },
      { id: "joined", accessorKey: "joinedOnBs", header: "Joined (BS)", meta: { mono: true } satisfies ColumnMeta },
      { id: "status", accessorFn: (r) => (r.isActive ? 1 : 0), header: "Status", cell: ({ row }) => <StaffStatus isActive={row.original.isActive} /> },
    ],
    [],
  );

  return (
    <PageFrame
      icon={<Users />}
      tint="amber"
      eyebrow="People"
      title="Staff"
      meta={`${rows.length} on record · ${rows.filter((r) => r.isActive).length} active`}
      actions={
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetTrigger render={<Button />}><Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>Add staff</TranslatedText></SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader><SheetTitle><TranslatedText>Add a staff member</TranslatedText></SheetTitle><SheetDescription><TranslatedText>The Nepali name is optional here, but printed documents use it.</TranslatedText></SheetDescription></SheetHeader>
            <div className="px-4 pb-6"><AddStaffForm /></div>
          </SheetContent>
        </Sheet>
      }
    >
      <PageFrame.Tabs>
        <RegisterTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Designations" baseId={baseId} panelId={panelId} />
      </PageFrame.Tabs>

      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search staff" className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </label>
        <FieldSelect aria-label="Status" value={status} onValueChange={(v) => setStatus(v ?? "all")} options={[{ value: "active", label: "Status: Active" }, { value: "inactive", label: "Status: Inactive" }, { value: "all", label: "Status: Any" }]} className="h-8 w-44 shrink-0" />
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">{visible.length} <TranslatedText>{visible.length === 1 ? "person" : "people"}</TranslatedText><TranslatedText>{selectedRow ? " · 1 selected" : ""}</TranslatedText></span>
      </PageFrame.Toolbar>

      <PageFrame.Split
        aside={selectedRow ? (summaryMatches ? <StaffPane key={summary!.staffId} summary={summary!} row={selectedRow} onClose={clearSelection} canManageAccounts={canManageAccounts} yearLabel={yearLabel} ladder={ladder} /> : <StaffPaneSkeleton />) : undefined}
        asideTitle={selectedRow?.fullName ?? "Staff member"}
        asideOpen={selectedRow != null}
        onAsideClose={clearSelection}
      >
        <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)}>
          <DataTable<StaffRow>
            id="staff"
            columns={columns}
            rows={visible}
            getRowId={(r) => String(r.id)}
            selectedId={optimisticId == null ? null : String(optimisticId)}
            onSelect={select}
            rowActions={(row) => <RowActions row={row} />}
            initialSort={[{ id: "fullName", desc: false }]}
            empty={{
              icon: rows.length === 0 ? UserPlus : Users,
              tint: "amber",
              title: rows.length === 0 ? "No staff on record" : "No one matches",
              description: rows.length === 0 ? "Add the first staff member." : "Try another designation, status or search.",
              action: rows.length === 0 ? <Button onClick={() => setAddOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>Add staff</TranslatedText></Button> : undefined,
            }}
          />
        </PageFrame.Body>
      </PageFrame.Split>
    </PageFrame>
  );
}
