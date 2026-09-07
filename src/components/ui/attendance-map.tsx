import type { AttendanceStatus } from "@/generated/prisma/enums";
import { BS_MONTHS, adToBs } from "@/lib/date/bs";
import { cn } from "@/lib/utils";

// A contribution-graph style calendar: one square per day, weeks running left to
// right, weekdays down. Month labels are Bikram Sambat, because that is the
// calendar the school keeps.

const WEEKDAY_LABELS = ["Sun", "", "Tue", "", "Thu", "", "Sat"];

export type MapDay = {
  /** Gregorian midnight UTC. */
  date: Date;
  /** 0..1 attendance rate, or null when no roll call happened. */
  rate: number | null;
  /** Present only when the map represents one student's categorical record. */
  status?: AttendanceStatus;
  label: string;
};

/// Five steps plus an untaken state, so "nobody took the register" never reads
/// as "everybody was absent".
function levelClass(rate: number | null) {
  if (rate === null) return "bg-rail";
  if (rate >= 0.98) return "bg-emerald-600 dark:bg-emerald-500";
  if (rate >= 0.9) return "bg-emerald-500/75 dark:bg-emerald-500/70";
  if (rate >= 0.75) return "bg-emerald-500/50 dark:bg-emerald-500/45";
  if (rate > 0) return "bg-amber-500/60 dark:bg-amber-500/50";
  return "bg-red-500/60 dark:bg-red-500/50";
}

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: "bg-ok",
  ABSENT: "bg-bad",
  LATE: "bg-warn",
  LEAVE: "bg-brand",
};

const utcKey = (d: Date) =>
  `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

export function AttendanceMap({
  from,
  to,
  days,
  caption,
  variant = "rate",
}: {
  from: Date;
  to: Date;
  days: MapDay[];
  caption?: string;
  variant?: "rate" | "status";
}) {
  const byDate = new Map(days.map((d) => [utcKey(d.date), d]));

  // Start on the Sunday on or before `from` so every column is a full week.
  const start = new Date(from);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const weeks: { date: Date; inRange: boolean }[][] = [];
  const cursor = new Date(start);
  while (cursor <= to) {
    const week: { date: Date; inRange: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        date: new Date(cursor),
        inRange: cursor >= from && cursor <= to,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  // Label a column when its first in-range day opens a new BS month.
  const monthLabels = weeks.map((week, i) => {
    const first = week.find((d) => d.inRange);
    if (!first) return null;
    const bs = adToBs(first.date);
    if (i === 0) return BS_MONTHS[bs.month - 1];
    const prev = weeks[i - 1].find((d) => d.inRange);
    if (!prev) return BS_MONTHS[bs.month - 1];
    return adToBs(prev.date).month === bs.month ? null : BS_MONTHS[bs.month - 1];
  });

  const taken = days.filter((d) => variant === "status" ? d.status !== undefined : d.rate !== null).length;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1">
          <div className="mt-5 grid shrink-0 grid-rows-7 gap-1 pr-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="text-muted-foreground flex h-3 items-center text-[9px] leading-none"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                <span className="text-muted-foreground h-4 text-[9px] leading-none whitespace-nowrap">
                  {monthLabels[wi] ?? ""}
                </span>
                {week.map((cell, di) => {
                  if (!cell.inRange) {
                    return <span key={di} className="size-3" />;
                  }
                  const day = byDate.get(utcKey(cell.date));
                  const bs = adToBs(cell.date);
                  const stamp = `${bs.year}-${String(bs.month).padStart(2, "0")}-${String(bs.day).padStart(2, "0")}`;
                  return (
                    <span
                      key={di}
                      title={day ? `${stamp} — ${day.label}` : `${stamp} — not taken`}
                      className={cn(
                        "size-3 rounded-[3px]",
                        variant === "status"
                          ? day?.status ? STATUS_CLASS[day.status] : "bg-rail"
                          : levelClass(day?.rate ?? null),
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>
          {taken} day{taken === 1 ? "" : "s"} recorded
          {caption ? ` · ${caption}` : ""}
        </span>
        {variant === "status" ? (
          <>
            <LegendItem className="bg-ok">Present</LegendItem>
            <LegendItem className="bg-bad">Absent</LegendItem>
            <LegendItem className="bg-warn">Late</LegendItem>
            <LegendItem className="bg-brand">Leave</LegendItem>
          </>
        ) : (
          <span className="flex items-center gap-1">
            Low
            <span className="bg-red-500/60 dark:bg-red-500/50 size-3 rounded-[3px]" />
            <span className="bg-amber-500/60 dark:bg-amber-500/50 size-3 rounded-[3px]" />
            <span className="bg-emerald-500/50 dark:bg-emerald-500/45 size-3 rounded-[3px]" />
            <span className="bg-emerald-500/75 dark:bg-emerald-500/70 size-3 rounded-[3px]" />
            <span className="bg-emerald-600 dark:bg-emerald-500 size-3 rounded-[3px]" />
            High
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="bg-rail size-3 rounded-[3px]" />
          Not taken
        </span>
      </div>
    </div>
  );
}

function LegendItem({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-3 rounded-[3px]", className)} aria-hidden="true" />
      {children}
    </span>
  );
}
