"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { DataTable } from "@/components/ui/data-table";
import type { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RegisterTab } from "@/components/ui/register-tabs";
import { sectionCode } from "@/lib/register-codes";
import { FeeSegmented } from "./fee-segmented";

const ALL = "all";

/// "Grade 4 A" → "4A". The service rosters carry a pupil's class as one label
/// rather than as a grade and a section of its own, so the badge code is
/// derived by splitting at the last space: the section name is the last word.
function labelCode(label: string) {
  const at = label.lastIndexOf(" ");
  return at === -1
    ? label.slice(0, 3).toUpperCase()
    : sectionCode(label.slice(0, at), label.slice(at + 1));
}

/// The list of students on one service — transport, library, anything billed
/// per pupil.
///
/// The same three pieces the Students register is made of, in the same order:
/// a class tab strip, a search box with a count beside it, and the shared
/// `DataTable` (sorting, rows per page, pagination, density, row actions).
/// Both service panels hand-rolled their own `<Table>` with a bespoke pager
/// before this, which is why one could sort and the other could not.
export function ServiceRoster<T>({
  id,
  rows,
  columns,
  getRowId,
  sectionOf,
  searchOf,
  noun,
  empty,
  rowActions,
  selection,
  bulkActions,
  initialSort,
  disabled = false,
}: {
  /// Also the key the table's rows-per-page and density preferences are saved
  /// under, so every service roster shares one setting.
  id: string;
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  /// The pupil's class label, e.g. "Grade 4 A". Drives the tab strip.
  sectionOf: (row: T) => string;
  /// Everything the search box should match on, already joined.
  searchOf: (row: T) => string;
  /// What one row is, for the count and the search label: "registration".
  noun: string;
  empty: ComponentProps<typeof EmptyState>;
  rowActions?: (row: T) => ReactNode;
  initialSort?: SortingState;
  disabled?: boolean;
  /// Tick-boxes and the bar that acts on them. The ids are held by the caller,
  /// so a selection survives paging, searching and switching class tab — the
  /// rows on screen change, the pupils you ticked do not.
  selection?: ComponentProps<typeof DataTable<T>>["selection"];
  /// Shown above the table only while something is ticked.
  bulkActions?: ReactNode;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const [tab, setTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  // Counted before the search, as on the Students register: the number on a
  // tab is what switching to it would show. Search narrows within a tab; it
  // should not renumber the strip on every keystroke.
  const tabs = useMemo<RegisterTab[]>(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = sectionOf(row);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const classes = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([label, count]) => ({ id: label, code: labelCode(label), label, count }));
    return [{ id: ALL, code: "ALL", label: "All classes", count: rows.length }, ...classes];
    // `sectionOf` is a fresh closure on every render; the rows are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const activeLabel = tabs.find((t) => t.id === tab)?.label ?? "All classes";

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab !== ALL && sectionOf(row) !== tab) return false;
      return needle === "" || searchOf(row).toLowerCase().includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, query]);

  return (
    <div className="min-w-0 space-y-3">
      {/* Only worth a strip once there is more than one class on the service.
          A single tab reading "All classes" is furniture, not navigation.
          Pills rather than the register's tabbed shape: this list sits inside
          a card, not at the top of a page, and the register tab's code badge
          would repeat the class name it already shows. */}
      {tabs.length > 2 ? (
        <div className="max-w-full overflow-x-auto">
          <FeeSegmented
            ariaLabel="Classes"
            value={tab}
            onChange={setTab}
            options={tabs.map((entry) => ({ value: entry.id, label: entry.label, count: entry.count }))}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-2.5 sm:flex-none">
          <Search className="size-3.5" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${activeLabel}`}
            aria-label={`Search ${activeLabel}`}
            disabled={disabled}
            className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-xs whitespace-nowrap">
          {visible.length} {visible.length === 1 ? noun : `${noun}s`}
        </span>
      </div>

      {/* Only while something is ticked, and above the table rather than
          floating over it: a bar that covers the rows you are choosing is a
          bar you have to dismiss to check your own work. */}
      {selection && selection.ids.length > 0 ? (
        <div className="border-brand-tint-2 bg-brand-tint flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2">
          <p role="status" className="text-brand-text text-xs font-medium">
            {selection.ids.length}<TranslatedText> selected
          </TranslatedText></p>
          <span className="flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions}
            <Button type="button" variant="ghost" size="sm" onClick={() => selection.onChange([])}><TranslatedText>
              Clear
            </TranslatedText></Button>
          </div>
        </div>
      ) : null}

      <div
        id={panelId}
        role="region"
        aria-label={`${activeLabel} roster`}
      >
        <DataTable<T>
          id={id}
          columns={columns}
          rows={visible}
          getRowId={getRowId}
          rowActions={rowActions}
          selection={selection}
          initialSort={initialSort}
          // Nobody on the service and nobody matching the search are two
          // different situations, and only one of them is solved by
          // registering somebody. The caller's empty state is the first;
          // filtering everything away gets its own line.
          empty={
            rows.length > 0 && visible.length === 0
              ? {
                  icon: empty.icon,
                  tint: empty.tint,
                  title: `No matching ${noun}s`,
                  description: "Try another student name, class, or search term.",
                }
              : empty
          }
        />
      </div>
    </div>
  );
}
