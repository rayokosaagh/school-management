/// The subset of a TanStack column definition this needs: enough to work out
/// the id TanStack will give the column, without importing the table types.
export type ColumnIdSource = { id?: string; accessorKey?: unknown; enableHiding?: boolean };

/// The ids of the columns a stored preference is allowed to hide, derived
/// exactly as TanStack derives them (`id`, else the accessor key with dots
/// turned into underscores). A column later marked `enableHiding: false` is
/// left out so a stale `prefs.hidden` entry cannot hide it for good — the
/// columns menu filters by `getCanHide()`, so there would be no way back.
export function hideableColumnIds(columns: ColumnIdSource[]): Set<string> {
  const ids = new Set<string>();
  for (const column of columns) {
    if (column.enableHiding === false) continue;
    const id = column.id ?? (column.accessorKey == null ? undefined : String(column.accessorKey).replace(/\./g, "_"));
    if (id) ids.add(id);
  }
  return ids;
}
