"use client";

import { money } from "@/lib/fees/money";

/// Fee money is right-aligned and monospaced so a column of figures can be
/// scanned by length — the digit that matters is the one furthest left.
export function Amount({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <span className={strong ? "font-semibold tabular-nums" : "text-ink-2 tabular-nums"}>
      {money(value)}
    </span>
  );
}

export function Owed({ value, overdue = false }: { value: number; overdue?: boolean }) {
  if (value === 0) return <span className="text-ink-3 tabular-nums">—</span>;
  return (
    <span
      className={
        overdue ? "text-tint-rose-fg font-semibold tabular-nums" : "font-semibold tabular-nums"
      }
    >
      {money(value)}
    </span>
  );
}
