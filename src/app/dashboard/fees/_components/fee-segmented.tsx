"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { FieldSelect } from "@/components/ui/select";

/// The Fees page's view switches, with the sliding thumb the register tabs
/// have.
///
/// A local copy of `@/components/ui/segmented` rather than a change to it: the
/// shared one is on Students, Classes and Staff as well, and this page's
/// polish should not quietly restyle theirs. It is the same markup and the
/// same classes; the only difference is that the active background is a
/// `layoutId` element, so moving between options slides rather than blinks.
/// If the rest of the app ever wants this, the fix is to move this file into
/// `components/ui`, not to fork it again.
export type FeeSegmentedOption<T extends string> = {
  value: T;
  label: string;
  /// Optional trailing count, shown in a pill.
  count?: number;
};

export function FeeSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  collapseBelow,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: FeeSegmentedOption<T>[];
  ariaLabel: string;
  /** Render as a select below this width — for the second strip on a page,
   *  which on a phone cost a third of the screen. See `RegisterTabs`. */
  collapseBelow?: "sm";
  className?: string;
}) {
  const reduce = useReducedMotion();
  // Per instance, so two strips on one page cannot share a thumb and shoot it
  // across the screen when the other one changes.
  const thumbId = useId();
  const wide = useMediaQuery("(min-width: 640px)");

  if (collapseBelow && !wide) {
    return (
      <FieldSelect
        aria-label={ariaLabel}
        value={value}
        onValueChange={(next) => { if (next) onChange(next as T); }}
        options={options.map((option) => ({
          value: option.value,
          label: option.count === undefined ? option.label : `${option.label} (${option.count})`,
        }))}
        className={cn("h-8 w-full", className)}
      />
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn(
        "bg-surface-2 border-line inline-flex h-8 items-center gap-0.5 rounded-lg border p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              // Arrows move between segments, matching a real tab strip.
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = options.findIndex((o) => o.value === value);
              const next =
                e.key === "ArrowRight"
                  ? options[(i + 1) % options.length]
                  : options[(i - 1 + options.length) % options.length];
              onChange(next.value);
            }}
            className={cn(
              "focus-visible:ring-brand/40 relative inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-label whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active ? "text-ink font-semibold" : "text-ink-3 hover:text-ink",
            )}
          >
            {/* The raised tile is its own element so it can travel between
                options. Behind the label, never over it. */}
            {active ? (
              <motion.span
                layoutId={reduce ? undefined : thumbId}
                aria-hidden="true"
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="bg-surface border-line absolute inset-0 rounded-[6px] border shadow-[0_1px_2px_oklch(0_0_0/8%)]"
              />
            ) : null}
            <span className="relative">{option.label}</span>
            {option.count !== undefined ? (
              <span
                className={cn(
                  "relative rounded px-1 font-mono text-caption tabular-nums",
                  active ? "bg-brand-tint text-brand-text" : "text-ink-3",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
