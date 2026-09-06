"use client";

import { AlarmClock, FileWarning, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { IconTile, type Tint } from "@/components/ui/page-shell";
import { money } from "@/lib/fees/money";

/// The year's headline figures, in the header row beside the view switch.
///
/// Deliberately chips and not `Kpi` cards: `Kpi` is for a summary screen where
/// the number is the content (Overview, the rollover review). Fees is a
/// worklist, and a row of full cards here pushed the actual work below the
/// fold. These carry the same numbers at a scale that lets the list stay first.
///
/// They are also deliberately about work rather than about money. "Total
/// students" and "Invoiced" were true and useless — a bursar already knows the
/// size of the school, and a count of bills issued names nothing to do. Every
/// chip here is a queue: who to chase, which bills are late, who nobody has
/// billed, and what the sum of it comes to.
function Chip({
  icon,
  tint,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tint: Tint;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 4 }, shown: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="border-line bg-surface flex items-center gap-2.5 rounded-xl border px-3 py-1.5"
    >
      <IconTile icon={icon} tint={tint} size="sm" />
      <div className="min-w-0 leading-tight">
        <p className="text-ink-3 text-[11px] whitespace-nowrap">{label}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tabular-nums">{value}</span>
          {hint ? (
            <span className="text-ink-3 text-[11px] tabular-nums whitespace-nowrap">{hint}</span>
          ) : null}
        </p>
      </div>
    </motion.div>
  );
}

export type FeeStats = {
  students: number;
  arrears: number;
  outstanding: number;
  collected: number;
  billed: number;
  overdue: number;
  overdueAmount: number;
  unbilled: number;
  unbilledMonths: number;
};

/// The same figures as one line of prose, for the header's meta slot below the
/// breakpoint where the chips appear. Kept beside them so the two can never
/// drift apart.
export function feeStatsLine(stats: FeeStats): string {
  const parts = [
    `${stats.arrears} owing ${money(stats.outstanding)}`,
    stats.overdue > 0 ? `${stats.overdue} overdue` : null,
    stats.unbilled > 0 ? `${stats.unbilled} not billed` : null,
  ].filter((part) => part !== null);
  return parts.join(" · ");
}

export function FeeStatChips(stats: FeeStats) {
  const { students, arrears, outstanding, collected, billed, overdue, overdueAmount, unbilled, unbilledMonths } = stats;
  const reduce = useReducedMotion();
  // Rounded, not floored: 99.6% collected should not read as 99%, and a
  // billed-nothing year is 0% rather than a division by zero.
  const rate = billed === 0 ? 0 : Math.round((collected / billed) * 100);

  return (
    // Desktop only, and from `lg` rather than `sm` now that there are four of
    // them. These are content-sized, and so is every ancestor up to the page
    // header, so on a narrow screen they widened the header past the viewport
    // and pushed the payment button off the edge — no max-width could cap it,
    // because the box being capped was the one doing the widening. Below the
    // breakpoint the same figures ride in the header's meta line instead.
    <motion.div
      // Four figures arriving together read as one block of noise; 40ms apart
      // they read left to right, which is the order they should be read in.
      initial={reduce ? false : "hidden"}
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: 0.04 } } }}
      className="hidden items-center gap-2 lg:flex"
    >
      <Chip
        icon={Users}
        tint={arrears > 0 ? "amber" : "green"}
        label="Students owing"
        value={String(arrears)}
        hint={students > 0 ? `of ${students}` : undefined}
      />
      <Chip
        icon={AlarmClock}
        tint={overdue > 0 ? "rose" : "green"}
        label="Overdue bills"
        value={String(overdue)}
        hint={overdue > 0 ? money(overdueAmount) : undefined}
      />
      <Chip
        icon={FileWarning}
        tint={unbilled > 0 || unbilledMonths > 0 ? "violet" : "green"}
        label="Not billed yet"
        value={String(unbilled)}
        hint={
          unbilledMonths > 0
            ? `${unbilledMonths} month${unbilledMonths === 1 ? "" : "s"} missed`
            : undefined
        }
      />
      <Chip
        icon={Wallet}
        tint={outstanding > 0 ? "amber" : "green"}
        label="Outstanding"
        value={money(outstanding)}
        hint={billed > 0 ? `${rate}% collected` : undefined}
      />
    </motion.div>
  );
}
