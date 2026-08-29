export type Density = "comfortable" | "compact";
export type PageSize = 25 | 50 | 100;
export type TablePrefs = { density: Density; pageSize: PageSize; hidden: string[] };

export const PAGE_SIZES: PageSize[] = [25, 50, 100];
export const DEFAULT_PREFS: TablePrefs = { density: "comfortable", pageSize: 25, hidden: [] };

/// A fresh copy every time. `hidden` is mutable, and callers put the result
/// straight into state — handing out the shared constant would let one table's
/// edit leak into the defaults every other table starts from.
function defaults(): TablePrefs {
  return { ...DEFAULT_PREFS, hidden: [] };
}

export function prefsKey(id: string) {
  return `table:${id}`;
}

/// Tolerant of anything stored by an older build: each field is validated on
/// its own and falls back to the default.
export function parsePrefs(raw: string | null): TablePrefs {
  if (!raw) return defaults();
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return defaults();
  }
  if (typeof v !== "object" || v === null) return defaults();
  const o = v as Record<string, unknown>;
  return {
    density: o.density === "compact" ? "compact" : "comfortable",
    pageSize: PAGE_SIZES.includes(o.pageSize as PageSize) ? (o.pageSize as PageSize) : 25,
    hidden: Array.isArray(o.hidden) && o.hidden.every((h) => typeof h === "string") ? (o.hidden as string[]) : [],
  };
}

export function loadPrefs(id: string): TablePrefs {
  try {
    return parsePrefs(localStorage.getItem(prefsKey(id)));
  } catch {
    return defaults();
  }
}

export function savePrefs(id: string, prefs: TablePrefs) {
  try {
    localStorage.setItem(prefsKey(id), JSON.stringify(prefs));
  } catch {
    // Storage blocked: the preference lives for this page only.
  }
}
