"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";

// A view switch, not a row of buttons. Outline buttons sitting beside a primary
// action read as text; a filled track with a raised thumb says "pick one".

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /// Optional trailing count, shown in a pill.
  count?: number;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="tablist"
      aria-label={t(ariaLabel)}
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
              "focus-visible:ring-brand/40 inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-surface text-ink border-line font-semibold shadow-[0_1px_2px_oklch(0_0_0/8%)]"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {t(option.label)}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "rounded px-1 font-mono text-[11px] tabular-nums",
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
