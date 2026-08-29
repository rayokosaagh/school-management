"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Rows3 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_PREFS, PAGE_SIZES, loadPrefs, savePrefs, type TablePrefs } from "@/lib/table/prefs";
import { cn } from "@/lib/utils";

export type ColumnMeta = { numeric?: boolean; mono?: boolean; width?: string };

type EmptyProps = React.ComponentProps<typeof EmptyState>;

export function DataTable<T>({
  id,
  columns,
  rows,
  getRowId,
  selectedId,
  onSelect,
  rowActions,
  empty,
  initialSort = [],
  className,
}: {
  id: string;
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectedId?: string | null;
  onSelect?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  empty: EmptyProps;
  initialSort?: SortingState;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_PREFS);
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [pageIndex, setPageIndex] = useState(0);

  // Preferences come from localStorage, which does not exist on the server.
  useEffect(() => setPrefs(loadPrefs(id)), [id]);
  function updatePrefs(patch: Partial<TablePrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(id, next);
  }

  const columnVisibility = useMemo<VisibilityState>(
    () => Object.fromEntries(prefs.hidden.map((h) => [h, false])),
    [prefs.hidden],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnVisibility, pagination: { pageIndex, pageSize: prefs.pageSize } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize: prefs.pageSize }) : updater;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageRows = table.getRowModel().rows;
  const total = rows.length;
  const from = total === 0 ? 0 : pageIndex * prefs.pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * prefs.pageSize);
  const rowHeight = prefs.density === "compact" ? "h-[var(--row-compact)]" : "h-[var(--row)]";

  if (total === 0) return <EmptyState {...empty} />;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-surface-2 sticky top-0 z-[1]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const meta = (header.column.columnDef.meta ?? {}) as ColumnMeta;
                  const sort = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
                      style={meta.width ? { width: meta.width } : undefined}
                      className={cn(
                        "text-ink-3 h-9 px-2.5 text-[11.5px] font-medium tracking-[0.04em] uppercase whitespace-nowrap",
                        meta.numeric && "text-right",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "hover:text-ink inline-flex items-center gap-1 rounded focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
                            sort && "text-brand-text",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sort === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : sort === "desc" ? (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
                {rowActions ? <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pageRows.map((row, i) => {
              const rid = row.id;
              const selected = selectedId != null && rid === selectedId;
              return (
                <motion.tr
                  key={rid}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: Math.min(i, 12) * 0.02, ease: [0.2, 0.8, 0.2, 1] }}
                  tabIndex={onSelect ? 0 : undefined}
                  aria-selected={onSelect ? selected : undefined}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
                    onSelect?.(row.original);
                  }}
                  onKeyDown={(e) => {
                    if (!onSelect || (e.key !== "Enter" && e.key !== " ")) return;
                    if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
                    e.preventDefault();
                    onSelect(row.original);
                  }}
                  className={cn(
                    "border-line group border-b transition-colors last:border-b-0",
                    onSelect && "hover:bg-surface-2 cursor-default",
                    selected && "bg-brand-tint hover:bg-brand-tint",
                    "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none focus-visible:ring-inset",
                  )}
                >
                  {row.getVisibleCells().map((cell, ci) => {
                    const meta = (cell.column.columnDef.meta ?? {}) as ColumnMeta;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          rowHeight,
                          "px-2.5 py-0 whitespace-nowrap",
                          meta.numeric && "text-right",
                          meta.mono && "font-mono tabular-nums",
                          selected && ci === 0 && "shadow-[inset_3px_0_0_var(--brand)]",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                  {rowActions ? (
                    <TableCell className={cn(rowHeight, "px-2.5 py-0")}>
                      <span
                        data-row-actions
                        className={cn(
                          "inline-flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                          selected && "opacity-100",
                        )}
                      >
                        {rowActions(row.original)}
                      </span>
                    </TableCell>
                  ) : null}
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="text-ink-3 flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[12.5px]">
        <span>
          Showing <b className="text-ink font-mono font-medium">{from}–{to}</b> of{" "}
          <b className="text-ink font-mono font-medium">{total}</b>
        </span>
        <span className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Rows per page" className="border-line hover:bg-surface-2 inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono">
              <Rows3 className="size-3.5" aria-hidden="true" />
              {prefs.pageSize}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {PAGE_SIZES.map((n) => (
                <DropdownMenuItem key={n} onClick={() => { updatePrefs({ pageSize: n }); setPageIndex(0); }}>
                  {n} rows
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => updatePrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" })}>
                {prefs.density === "compact" ? "Comfortable rows" : "Compact rows"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Choose columns" className="border-line hover:bg-surface-2 inline-flex h-7 items-center rounded-md border px-2">
              <Columns3 className="size-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => {
                    const hidden = v ? prefs.hidden.filter((h) => h !== c.id) : [...prefs.hidden, c.id];
                    updatePrefs({ hidden });
                  }}
                >
                  {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            className="hover:bg-surface-2 grid size-7 place-items-center rounded-md disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="font-mono tabular-nums">{pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
          <button
            type="button"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            className="hover:bg-surface-2 grid size-7 place-items-center rounded-md disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}
