"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Tint } from "@/components/ui/page-shell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldSelect } from "@/components/ui/select";
import { TranslatedText, useLanguage, useTranslatedChildren } from "@/components/i18n/language-provider";

// A list of record cards with an in-card detail overlay, after the 21st.dev
// server-management-table. Generic over the row type so every page shares one
// interaction: scan the list, click a row, edit or delete it in place.

export type Column<T> = {
  key: string;
  header: string;
  /** Width out of 12 on md and up. Defaults to an even share. */
  span?: number;
  render: (row: T) => ReactNode;
  /** Hide on small screens where space is tight. */
  hideOnMobile?: boolean;
};

/// Groups contiguous rows under a small heading. Only meaningful when the rows
/// arrive already sorted by the same key.
export type Grouping<T> = {
  key: (row: T) => string;
  /** Shown once above each run of rows. Defaults to the key. */
  label?: (row: T) => ReactNode;
  /** Right-hand hint, e.g. how many rows are in the group. */
  meta?: (rows: T[]) => ReactNode;
};

/// A dropdown that narrows the list. `match` decides what the value means, so
/// the table stays ignorant of the domain.
export type Filter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

export type Tone = "positive" | "warning" | "critical" | "neutral";

const TONES: Record<Tone, string> = {
  positive:
    "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
  neutral: "bg-muted border-border text-muted-foreground",
};

export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const translatedChildren = useTranslatedChildren(children);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
      )}
    >
      {translatedChildren}
    </span>
  );
}

export function RecordTable<T>({
  title,
  subtitle,
  rows,
  columns,
  getKey,
  getSearchText,
  searchPlaceholder = "Search",
  empty = "Nothing here yet.",
  filters,
  groupBy,
  actions,
  rowActions,
  collapsibleGroups = false,
  initiallyCollapsed = false,
  density = "comfortable",
  renderDetail,
  detailTitle,
  icon,
  tint = "blue",
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string | number;
  getSearchText?: (row: T) => string;
  searchPlaceholder?: string;
  empty?: string;
  filters?: Filter<T>[];
  groupBy?: Grouping<T>;
  actions?: ReactNode;
  /// Buttons pinned to the right of each row. `open` raises the detail panel,
  /// so a row can offer both a shortcut and the full editor.
  rowActions?: (row: T, open: () => void) => ReactNode;
  /// Lets a grouped table fold each group away, so a long list reads as a short
  /// index of its groups until one is opened.
  collapsibleGroups?: boolean;
  initiallyCollapsed?: boolean;
  /// "compact" for tables whose rows carry only a few short values, where the
  /// default height wastes most of the row.
  density?: "comfortable" | "compact";
  renderDetail?: (row: T, close: () => void) => ReactNode;
  detailTitle?: (row: T) => ReactNode;
  /// Renders the same tinted tile `SectionCard` puts beside its heading, so a
  /// table can sit among section cards without looking like a different kind
  /// of thing. Omit it and the header is the plain title it has always been.
  icon?: LucideIcon;
  tint?: Tint;
  /// Sits inside the card below the rows — for a form or an action that
  /// belongs to the table as a whole rather than to any one row.
  footer?: ReactNode;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [openKey, setOpenKey] = useState<string | number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const reduce = useReducedMotion();

  const active = Object.entries(chosen).filter(([, v]) => v !== "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const picked = Object.entries(chosen).filter(([, v]) => v !== "");
    return rows.filter((row) => {
      if (q && getSearchText && !getSearchText(row).toLowerCase().includes(q)) {
        return false;
      }
      // Every chosen dropdown narrows further; an unset one is ignored.
      return picked.every(([key, value]) => {
        const filter = filters?.find((f) => f.key === key);
        return !filter || filter.match(row, value);
      });
    });
  }, [rows, query, getSearchText, filters, chosen]);

  // Contiguous runs sharing a group key. Without this, a roll number that
  // restarts at 1 in every section looks like duplicated data.
  const groups = useMemo(() => {
    if (!groupBy) return [{ label: null as ReactNode, meta: null as ReactNode, rows: filtered }];
    const out: { label: ReactNode; meta: ReactNode; rows: T[] }[] = [];
    let currentKey: string | null = null;
    for (const row of filtered) {
      const key = groupBy.key(row);
      if (key !== currentKey) {
        currentKey = key;
        out.push({
          label: groupBy.label ? groupBy.label(row) : key,
          meta: null,
          rows: [],
        });
      }
      out[out.length - 1].rows.push(row);
    }
    if (groupBy.meta) {
      for (const group of out) group.meta = groupBy.meta(group.rows);
    }
    return out;
  }, [filtered, groupBy]);

  const open = openKey === null ? null : (rows.find((r) => getKey(r) === openKey) ?? null);
  const close = () => setOpenKey(null);

  // The panel is a real dialog rather than an overlay clipped to the card, so a
  // long form scrolls on its own and popovers inside it are not cut off.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const totalSpan = columns.reduce((sum, c) => sum + (c.span ?? 0), 0);
  const spanFor = (c: Column<T>) => c.span ?? Math.max(1, Math.floor((12 - totalSpan) / columns.length));

  return (
    <div className="card-surface relative">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <IconTile icon={icon} tint={tint} /> : null}
          <div className="min-w-0">
          <h2 className="font-semibold">{t(title)}</h2>
          {subtitle ? (
            <p className="text-muted-foreground text-sm">
              {filtered.length !== rows.length
                ? `Showing ${filtered.length} of ${rows.length}`
                : subtitle}
            </p>
          ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters?.map((filter) => (
            <FieldSelect
              key={filter.key}
              aria-label={filter.label}
              value={chosen[filter.key] ?? ""}
              onValueChange={(next) =>
                setChosen((prev) => ({ ...prev, [filter.key]: next ?? "" }))
              }
              className="w-auto"
              options={[
                { value: "", label: `${filter.label}: all` },
                ...filter.options.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />
          ))}
          {getSearchText ? (
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-48 pl-7"
              />
            </div>
          ) : null}
          {actions}
        </div>
      </div>

      <div className="px-5 pb-5">
        {/* Column headers only make sense once the row grid is active. */}
        <div className="text-muted-foreground bg-rail mb-2 hidden items-center gap-3 rounded-lg px-4 py-2 text-[11px] font-medium tracking-wider uppercase md:flex">
          <div className="grid flex-1 grid-cols-12 gap-3">
          {columns.map((c) => (
            <div key={c.key} style={{ gridColumn: `span ${spanFor(c)}` }}>
               {t(c.header)}
            </div>
          ))}
          </div>
          {rowActions ? <div className="w-24 shrink-0 text-right">{t("Actions")}</div> : null}
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-6">
            <p className="text-muted-foreground text-sm">
              {query
                ? `Nothing matches “${query}”.`
                : active.length > 0
                  ? t("Nothing matches those filters.")
                  : t(empty)}
            </p>
            {(query || active.length > 0) && rows.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setQuery("");
                  setChosen({});
                }}
              ><TranslatedText>
                Clear filters
              </TranslatedText></Button>
            ) : null}
          </div>
        ) : (
          <motion.ul
            className={density === "compact" ? "space-y-1" : "space-y-2"}
            initial={reduce ? false : "hidden"}
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          >
            {groups.flatMap((group, gi) => {
              const groupKey = String(group.label ?? gi);
              // A search or filter is a request to see matches, so collapsing
              // is suspended while one is active.
              const forcedOpen = query !== "" || active.length > 0;
              const open =
                !collapsibleGroups ||
                forcedOpen ||
                (expanded[groupKey] ?? !initiallyCollapsed);

              return [
              group.label !== null ? (
                <li key={`group-${gi}`} className="px-1 pt-3 first:pt-0">
                  {collapsibleGroups ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [groupKey]: !(prev[groupKey] ?? !initiallyCollapsed),
                        }))
                      }
                      aria-expanded={open}
                      disabled={forcedOpen}
                      className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-1 flex w-[calc(100%+0.5rem)] items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:hover:bg-transparent"
                    >
                      <span className="flex items-center gap-1.5">
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            "text-muted-foreground size-3.5 transition-transform",
                            open && "rotate-90",
                          )}
                        />
                        <span className="text-sm font-medium">{group.label}</span>
                      </span>
                      {group.meta ? (
                        <span className="text-muted-foreground text-xs">{group.meta}</span>
                      ) : null}
                    </button>
                  ) : (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{group.label}</span>
                      {group.meta ? (
                        <span className="text-muted-foreground text-xs">{group.meta}</span>
                      ) : null}
                    </div>
                  )}
                </li>
              ) : null,
              ...(open ? group.rows : []).map((row) => {
                const key = getKey(row);
                const isOpen = openKey === key;
                return (
                  <motion.li
                  key={key}
                  variants={
                    reduce
                      ? {}
                      : {
                          hidden: { opacity: 0, y: 6 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            transition: { duration: 0.22, ease: "easeOut" },
                          },
                        }
                  }
                >
                  <div
                    role={renderDetail ? "button" : undefined}
                    tabIndex={renderDetail ? 0 : undefined}
                    onClick={renderDetail ? () => setOpenKey(key) : undefined}
                    onKeyDown={
                      renderDetail
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenKey(key);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "bg-rail focus-visible:ring-ring/50 rounded-xl px-4 transition-colors duration-200 focus-visible:ring-3 focus-visible:outline-none",
                      density === "compact" ? "py-1.5" : "py-3",
                      // Every row gets the hover shift, not only ones that open
                      // a detail panel: with hundreds of rows the eye still
                      // needs to track one across the width even when nothing
                      // is clickable.
                      "hover:bg-muted",
                      renderDetail && "cursor-pointer",
                      // The row behind an open detail panel stays marked while
                      // it's open, the same left-accent treatment DataTable
                      // uses for its selected row, so the panel reads as
                      // "editing this one" rather than a plain overlay.
                      isOpen && "bg-muted shadow-[inset_3px_0_0_var(--brand)]",
                    )}
                  >
                    {/* Stacked on small screens, grid from md up. */}
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                      <div className="grid flex-1 gap-2 md:grid-cols-12 md:items-center md:gap-3">
                        {columns.map((c) => (
                          <div
                            key={c.key}
                            className={cn(
                              "min-w-0 text-sm",
                              c.hideOnMobile && "hidden md:block",
                            )}
                            style={{ gridColumn: `span ${spanFor(c)}` }}
                          >
                            <span className="text-muted-foreground mr-2 text-[11px] tracking-wider uppercase md:hidden">
                              {c.header}
                            </span>
                            {c.render(row)}
                          </div>
                        ))}
                      </div>
                      {rowActions ? (
                        // Stops the click reaching the row, which would open the
                        // detail panel on top of whatever the action did.
                        <div
                          className="flex shrink-0 items-center justify-end gap-1 md:w-24"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {rowActions(row, () => setOpenKey(key))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.li>
                );
              }),
            ];
            })}
          </motion.ul>
        )}
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>

      {open && renderDetail
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) close();
                  }}
                >
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    initial={reduce ? false : { opacity: 0, y: 12, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.99 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    // bg-popover/ring-popover-border, not bg-surface/ring-black/5:
                    // this is a floating layer like every other popup, not a card.
                    className="bg-popover text-popover-foreground my-auto flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col rounded-2xl shadow-popover ring-1 ring-popover-border"
                  >
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b p-5">
                      <h3 className="font-semibold">
                        {detailTitle ? detailTitle(open) : title}
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={close}
                        aria-label="Close"
                      >
                        <X />
                      </Button>
                    </div>
                    {/* Keyed per record: the panel holds its own state, and
                        opening a second row must not inherit the first one's. */}
                    <div key={openKey} className="relative min-h-0 flex-1 overflow-y-auto p-5">
                      {renderDetail(open, close)}
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

    </div>
  );
}
