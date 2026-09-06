"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/// A quiet shape behind the header's figures.
///
/// Drawn rather than fetched: one inline SVG in the brand colour at low
/// opacity costs nothing to load, needs no dark-mode twin, and cannot go
/// missing. Hidden below `lg`, where the figures need the whole width.
function Motif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMaxYMid slice"
      className="text-brand pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[300px] opacity-[0.06] lg:block"
    >
      <circle cx="250" cy="42" r="72" fill="currentColor" />
      <circle cx="304" cy="126" r="46" fill="currentColor" opacity="0.65" />
      <rect x="146" y="92" width="118" height="58" rx="20" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export type SetupStat = {
  icon: LucideIcon;
  /// What the figure is, above it — "Admission & yearly". Optional: a figure
  /// that reads as its own label ("2 registered students") does not need one
  /// repeated over the top of it.
  label?: string;
  /// The figure itself — "Rs. 5,000", "2 registered students".
  value: string;
  /// The unit or caveat, under the figure.
  note: string;
};

/// The head of one service's page: what it is, whether it is running, and the
/// three numbers worth knowing before touching anything below.
///
/// Shaped after the Class pricing header on the step before it — same eyebrow,
/// same title scale, same tile row — so the two steps read as one screen with
/// different contents rather than two screens.
export function SetupHeader({
  icon: Icon,
  eyebrow,
  title,
  badge,
  description,
  stats,
  actions,
}: {
  /// The section's own mark, in the brand tint — the bus on transport, the
  /// table on class pricing. Optional, because a section without a natural
  /// one should not be given a decorative one to fill the space.
  icon?: LucideIcon;
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  description: string;
  stats: SetupStat[];
  actions?: ReactNode;
}) {
  return (
    <header className="border-line relative overflow-hidden border-b p-5 sm:p-7">
      <Motif />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span aria-hidden="true" className="bg-brand-tint text-brand-text grid size-10 shrink-0 place-items-center rounded-xl">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-brand-text text-xs font-medium">{eyebrow}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-xl font-semibold">{title}</h3>
              {badge}
            </div>
            <p className="text-ink-3 mt-2 max-w-xl text-sm leading-6">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {stats.length > 0 ? (
        <dl
          className={cn(
            "relative mt-6 grid gap-4",
            stats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
          )}
        >
          {/* White like every other card on the page. Tinting the whole tile
              made these the only brand-coloured panels on Fees, which clashed
              with the warm page ground rather than reading as a highlight; the
              colour is carried by the icon alone now. */}
          {stats.map((stat) => (
            <div key={stat.note} className="border-line bg-surface flex items-center gap-3 rounded-xl border p-4">
              <span aria-hidden="true" className="bg-brand-tint text-brand-text grid size-10 shrink-0 place-items-center rounded-xl">
                <stat.icon className="size-5" />
              </span>
              <div className="min-w-0">
                {stat.label ? <dt className="text-ink-3 text-xs break-words">{stat.label}</dt> : null}
                <dd className={cn("break-words font-semibold tabular-nums", stat.label ? "font-display text-xl" : "text-sm")}>
                  {stat.value}
                </dd>
                <dt className="text-ink-3 mt-0.5 text-xs break-words">{stat.note}</dt>
              </div>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
