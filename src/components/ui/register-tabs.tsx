"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/// The DOM id of one tab button. A page that wants its panel labelled by the
/// active tab passes its own `baseId` to `RegisterTabs` and calls this with the
/// same `baseId` to name the tab.
///
/// `tabId` is slugified because it is a data key, not an identifier: staff tabs
/// are free-text designations ("Vice Principal"), and a raw one would put a
/// space into an `id` and into the panel's `aria-labelledby`.
export function registerTabId(baseId: string, tabId: string): string {
  const slug = tabId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  className?: string;
}) {
  const reduce = useReducedMotion();
  const generatedId = useId();
  const baseId = baseIdProp ?? generatedId;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === value);
    if (i < 0) return;
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0 || next >= tabs.length) return;
    e.preventDefault();
    onChange(tabs[next].id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
  }

  return (
    <div className={cn("border-line overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex min-w-max items-end gap-0.5">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={registerTabId(baseId, tab.id)}
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
                  "border-line bg-page text-ink-3 rounded px-1.5 py-px font-mono text-[10.5px] tracking-[0.04em]",
                  selected && "bg-brand-tint text-brand-text border-brand-tint-2",
                )}
              >
                {tab.code}
              </span>
              {tab.label}
              {tab.count == null ? null : (
                <span className={cn("font-mono text-[11.5px] tabular-nums", tab.empty ? "text-warn" : selected ? "text-ink-2" : "text-ink-3")}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
