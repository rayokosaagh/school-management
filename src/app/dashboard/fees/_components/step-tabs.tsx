"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/// The numbered steps of Fee setup: price the classes, issue the bills, then
/// the services.
///
/// A strip rather than a segmented switch because these are an order, not a
/// set of equal views — the number is the point, and a school working through
/// setup for the first time should be able to see where it is in the sequence.
/// Colours are the page's own brand tint throughout; nothing here introduces a
/// palette of its own.
export function StepTabs<T extends string>({
  value,
  onChange,
  steps,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  steps: { value: T; label: string }[];
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  const thumbId = useId();

  return (
    <div role="tablist" aria-label={ariaLabel} aria-orientation="horizontal" className="flex flex-wrap items-center gap-1">
      {steps.map((step, index) => {
        const active = step.value === value;
        return (
          <button
            key={step.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(step.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const at = steps.findIndex((s) => s.value === value);
              const next =
                event.key === "ArrowRight"
                  ? steps[(at + 1) % steps.length]
                  : steps[(at - 1 + steps.length) % steps.length];
              onChange(next.value);
            }}
            className={cn(
              "focus-visible:ring-brand/40 bg-surface relative inline-flex h-9 items-center rounded-lg border px-3.5 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active ? "border-transparent font-semibold" : "border-line text-ink-3 hover:text-ink",
            )}
          >
            {/* The outline is its own element so it can travel between steps,
                the way the register tabs' indicator does. Behind the label,
                never over it. */}
            {active ? (
              <motion.span
                layoutId={reduce ? undefined : thumbId}
                aria-hidden="true"
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="border-brand absolute inset-0 rounded-lg border"
              />
            ) : null}
            {/* Numbered in the label rather than in a badge of its own: these
                are steps, and "1." reads as an order where a circled 1 beside
                a name reads as a count. */}
            <span className={cn("relative", active && "text-brand-text")}>
              {index + 1}. {step.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
