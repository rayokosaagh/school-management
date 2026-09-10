import type { DayStatus } from "@/lib/attendance/strip";
import { cn } from "@/lib/utils";

/// Re-exported so components that only draw a strip keep importing it here.
export type { DayStatus };

export function describeStrip(days: DayStatus[]): string {
  if (days.length === 0) return "No attendance recorded";
  const n = (s: DayStatus) => days.filter((d) => d === s).length;
  return `Last ${days.length} days: ${n("present")} present, ${n("absent")} absent, ${n("late")} late, ${n("none")} not taken`;
}

/// Share of taken days that were attended — late still counts as attending,
/// and days with no roll call are not held against anyone. `null` when the
/// strip holds no taken day at all.
export function stripPercent(days: DayStatus[]): number | null {
  const taken = days.filter((d) => d !== "none");
  if (taken.length === 0) return null;
  return Math.round((taken.filter((d) => d === "present" || d === "late").length / taken.length) * 100);
}

/// One bar per day, oldest first. Each status is encoded by shape as well as
/// colour, so the strip still reads without hue; the `aria-label` carries the
/// same detail in words for assistive tech.
export function AttendanceStrip({
  days,
  percent,
  size = "sm",
  className,
}: {
  days: DayStatus[];
  percent?: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={describeStrip(days) + (percent == null ? "" : `, ${percent}% present`)}
      className={cn("inline-flex items-end gap-0.5", className)}
    >
      {days.map((d, i) => (
        <i
          key={i}
          aria-hidden="true"
          className={cn(
            "rounded-[2px]",
            size === "sm" ? "h-3.5 w-1.5" : "h-5.5 w-full flex-1",
            d === "present" && "bg-ok opacity-85",
            // Absent: hollow — reads as a gap even without colour.
            d === "absent" && "border-bad border-2 bg-transparent",
            // Late: explicit half-height bar, sitting on the baseline.
            d === "late" && "bg-warn opacity-85",
            d === "late" && (size === "sm" ? "h-1.75 w-1.5" : "h-2.75 w-full flex-1"),
            // Not taken: faint dotted outline.
            d === "none" && "border-line border border-dashed bg-transparent",
          )}
        />
      ))}
      {percent == null ? null : (
        <em className="text-ink-3 ml-1.5 font-mono text-caption not-italic tabular-nums">{percent}%</em>
      )}
    </span>
  );
}
