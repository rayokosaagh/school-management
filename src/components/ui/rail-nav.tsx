"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The index half of a master-detail page: one row per group, the selected one
// driving the panel beside it. Keeps a long list to one group at a time.

export type RailItem = {
  key: string;
  /// Short code shown in the square badge, e.g. "SK" or "1 A".
  badge: string;
  label: string;
  count: number;
};

export function RailNav({
  title,
  items,
  selected,
  onSelect,
  hint,
  ariaLabel,
}: {
  title: string;
  items: RailItem[];
  selected: string | null;
  onSelect: (key: string) => void;
  hint?: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="card-surface flex flex-col p-3">
      <p className="px-2 py-1.5 text-sm font-semibold">{title}</p>
      <ul className="mt-1 max-h-[28rem] space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const active = item.key === selected;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  active ? "bg-tint-blue text-tint-blue-fg font-medium" : "hover:bg-muted/60",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-1.5 bottom-1.5 -left-1 w-0.5 rounded-full",
                    active ? "bg-action" : "bg-transparent",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-md px-1 text-[11px] font-semibold tabular-nums",
                    active
                      ? "bg-action text-action-foreground"
                      : "bg-rail text-muted-foreground",
                  )}
                >
                  {item.badge}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {item.count}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0",
                    active ? "" : "text-muted-foreground/50",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {hint ? (
        <p className="text-muted-foreground bg-rail mt-3 rounded-lg px-2.5 py-2 text-xs">
          {hint}
        </p>
      ) : null}
    </nav>
  );
}
