"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

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
  className,
}: {
  tabs: RegisterTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const layoutId = useId();

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
              aria-selected={selected}
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
                  layoutId={reduce ? undefined : layoutId}
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
