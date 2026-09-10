"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { FieldSelect } from "@/components/ui/select";

/// A stable, per-character fingerprint of a string: 4 hex digits per UTF-16
/// code unit, concatenated. Fixed width per unit makes this injective — the
/// only way two different strings can produce the same fingerprint is if they
/// are the same string — so it is used below to guarantee that two distinct
/// tab ids never slug to the same DOM id, even when they share no ASCII
/// characters (e.g. two different Devanagari designations).
function fingerprint(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    out += value.charCodeAt(i).toString(16).padStart(4, "0");
  }
  return out;
}

/// The DOM id of one tab button. A page that wants its panel labelled by the
/// active tab passes its own `baseId` to `RegisterTabs` and calls this with the
/// same `baseId` to name the tab.
///
/// `tabId` is slugified because it is a data key, not an identifier: staff tabs
/// are free-text designations ("Vice Principal"), and a raw one would put a
/// space into an `id` and into the panel's `aria-labelledby`.
///
/// Staff designations, and student/staff names generally, are bilingual — a
/// designation may be written entirely in Devanagari. Stripping non-ASCII
/// characters (the old behaviour) collapsed every such designation to the
/// same empty slug, so two different designations produced the same DOM id.
/// The fix: keep the readable ASCII-only slug when the input is pure ASCII
/// (unchanged from before, so existing ids stay stable and legible), and
/// otherwise append a `fingerprint()` of the *whole* raw tabId behind a "_"
/// that cannot occur in the ASCII slug (the slug alphabet is only
/// `[a-z0-9-]`; `_` always gets folded into `-`). Because that marker can
/// never appear inside the ASCII slug and never appears inside a fingerprint
/// (hex digits only), a slug carrying "_" cannot collide with one that
/// doesn't, and among slugs that do carry it, the fingerprint is injective —
/// so distinct tabIds can never produce the same slug.
export function registerTabId(baseId: string, tabId: string): string {
  const isAscii = /^[\x00-\x7F]*$/.test(tabId);
  const ascii = tabId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = isAscii ? ascii : `${ascii}_${fingerprint(tabId)}`;
  return `${baseId}-tab-${slug}`;
}

export type RegisterTab = {
  id: string;
  /// Short code shown in the badge: "KA", "1A", "ALL".
  code: string;
  label: string;
  count?: number;
  /// Marks a tab whose count is zero so it reads as a gap, not a quiet room.
  empty?: boolean;
};

/// A horizontal tab strip modelled on the tabbed paper attendance registers
/// Nepali schools keep: a code, the section name, and how many are on the roll.
export function RegisterTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  baseId: baseIdProp,
  panelId,
  collapseBelow,
  className,
}: {
  tabs: RegisterTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Namespace for the tab ids. Pass one (and the same one to `registerTabId`)
   *  when the panel needs `aria-labelledby` pointing at the active tab. */
  baseId?: string;
  /** The id of the `PageFrame.Body` this strip drives, if there is one. */
  panelId?: string;
  /** Render as a select below this width. For a *secondary* strip only — a
   *  page's first strip is its navigation and stays a strip; the second one
   *  stacked under it is what cost a phone a third of its screen. */
  collapseBelow?: "sm";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const generatedId = useId();
  const baseId = baseIdProp ?? generatedId;
  const wide = useMediaQuery("(min-width: 640px)");

  const scroller = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const box = scroller.current;
    if (!box) return;
    const max = box.scrollWidth - box.clientWidth;
    setCanScroll({ left: box.scrollLeft > 1, right: box.scrollLeft < max - 1 });
  }, []);

  function nudge(direction: 1 | -1) {
    const box = scroller.current;
    if (!box) return;
    box.scrollBy({ left: direction * Math.max(160, box.clientWidth * 0.6), behavior: "smooth" });
  }

  // Re-measure when the strip or its container changes size, not only on scroll.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, tabs.length]);

  // Keep the selected tab on screen: arrow-key navigation and a selection made
  // elsewhere both have to be able to reach a tab past the edge. Scrolled by
  // hand rather than scrollIntoView, which would also move the page vertically.
  useEffect(() => {
    const box = scroller.current;
    const tab = box?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(value)}"]`);
    if (!box || !tab) return;
    const b = box.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (t.left < b.left) box.scrollLeft -= b.left - t.left + 12;
    else if (t.right > b.right) box.scrollLeft += t.right - b.right + 12;
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === value);
    if (i < 0) return;
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0 || next >= tabs.length) return;
    e.preventDefault();
    onChange(tabs[next].id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
  }

  if (collapseBelow && !wide) {
    return (
      <FieldSelect
        aria-label={ariaLabel}
        value={value}
        onValueChange={(next) => { if (next) onChange(next); }}
        options={tabs.map((tab) => ({
          value: tab.id,
          label: tab.count === undefined ? tab.label : `${tab.label} (${tab.count})`,
        }))}
        className={cn("h-8 w-full", className)}
      />
    );
  }

  return (
    <div className={cn("border-line relative border-b", className)}>
      {/* The scrollbar is hidden by design, so an overflowing strip needs its
          own affordance — without these, tabs past the edge are unreachable
          by mouse. */}
      {canScroll.left ? (
        <>
          <span
            aria-hidden="true"
            className="from-page pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r to-transparent"
          />
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll tabs left"
            className="border-line bg-surface text-ink-2 hover:text-ink focus-visible:ring-ring/50 absolute top-1/2 left-0 z-20 grid size-6 -translate-y-1/2 place-items-center rounded-full border shadow-sm focus-visible:ring-3 focus-visible:outline-none"
          >
            <ChevronLeft className="size-3.5" />
          </button>
        </>
      ) : null}

      {canScroll.right ? (
        <>
          <span
            aria-hidden="true"
            className="from-page pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l to-transparent"
          />
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll tabs right"
            className="border-line bg-surface text-ink-2 hover:text-ink focus-visible:ring-ring/50 absolute top-1/2 right-0 z-20 grid size-6 -translate-y-1/2 place-items-center rounded-full border shadow-sm focus-visible:ring-3 focus-visible:outline-none"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </>
      ) : null}

      <div
        ref={scroller}
        onScroll={measure}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex min-w-max items-end gap-0.5">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={registerTabId(baseId, tab.id)}
              data-tab-id={tab.id}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "border-line bg-surface-2 text-ink-3 hover:bg-surface hover:text-ink relative flex h-[34px] items-center gap-2 rounded-t-lg border border-b-0 px-3 pl-2.5 font-medium transition-[background-color,color,height]",
                "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
                selected && "bg-surface text-ink border-line-strong h-[38px]",
              )}
            >
              {selected ? (
                <motion.span
                  layoutId={reduce ? undefined : baseId}
                  aria-hidden="true"
                  className="bg-brand absolute inset-x-[-1px] top-[-1px] h-[3px] rounded-t-lg"
                />
              ) : null}
              <span
                className={cn(
                  "border-line bg-page text-ink-3 rounded px-1.5 py-px font-mono text-caption tracking-[0.04em]",
                  selected && "bg-brand-tint text-brand-text border-brand-tint-2",
                )}
              >
                {tab.code}
              </span>
              {tab.label}
              {tab.count == null ? null : (
                <span className={cn("font-mono text-caption tabular-nums", tab.empty ? "text-warn" : selected ? "text-ink-2" : "text-ink-3")}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
