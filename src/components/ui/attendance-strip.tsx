import { cn } from "@/lib/utils";

export type DayStatus = "present" | "absent" | "late" | "none";

export function describeStrip(days: DayStatus[]): string {
  if (days.length === 0) return "No attendance recorded";
  const n = (s: DayStatus) => days.filter((d) => d === s).length;
  return `Last ${days.length} days: ${n("present")} present, ${n("absent")} absent, ${n("late")} late, ${n("none")} not taken`;
}

const TONE: Record<DayStatus, string> = {
  present: "bg-ok",
  absent: "bg-bad",
  late: "bg-warn",
  none: "bg-line",
};

/// One bar per day, oldest first. Colour carries the detail; the label carries
/// it for everyone else.
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
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {days.map((d, i) => (
        <i
          key={i}
          aria-hidden="true"
          className={cn("rounded-[2px] opacity-85", TONE[d], size === "sm" ? "h-3.5 w-1.5" : "h-5.5 w-full flex-1")}
        />
      ))}
      {percent == null ? null : (
        <em className="text-ink-3 ml-1.5 font-mono text-[11.5px] not-italic tabular-nums">{percent}%</em>
      )}
    </span>
  );
}
