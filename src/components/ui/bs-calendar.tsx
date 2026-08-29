"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  BS_MONTHS,
  adToBs,
  bsMonthLength,
  bsToAd,
  parseBsInput,
} from "@/lib/date/bs";

// A three-level year -> month -> day picker, native to Bikram Sambat. Modelled on
// the CalendarLume interaction, but driven by the BS conversion table rather than
// a Gregorian one, because that is the calendar the paper records use.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

type Step = "year" | "month" | "day";

export function BsCalendar({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (next: string) => void;
  className?: string;
}) {
  const parsed = value ? parseBsInput(value) : null;
  const selected = parsed ? adToBs(parsed) : null;
  const today = adToBs(new Date());

  const [step, setStep] = useState<Step>(selected ? "day" : "year");
  const [year, setYear] = useState(selected?.year ?? today.year);
  const [month, setMonth] = useState(selected?.month ?? today.month);

  const reduce = useReducedMotion();
  const fade = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2 },
      };

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = BS_MIN_YEAR; y <= BS_MAX_YEAR; y++) out.push(y);
    return out;
  }, []);

  // Day 1's weekday decides the leading blanks; the month's real length decides
  // how many cells follow.
  const grid = useMemo(() => {
    let length: number;
    let firstWeekday: number;
    try {
      length = bsMonthLength(year, month);
      firstWeekday = bsToAd({ year, month, day: 1 }).getUTCDay();
    } catch {
      return null;
    }
    return { length, firstWeekday };
  }, [year, month]);

  const pick = (day: number) => {
    onChange(`${year}-${pad(month)}-${pad(day)}`);
  };

  return (
    <div
      className={cn(
        "bg-popover text-popover-foreground w-72 rounded-xl border p-3 shadow-md",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {step === "year" && "Choose a year"}
          {step === "month" && year}
          {step === "day" && `${BS_MONTHS[month - 1]} ${year}`}
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant={step === "year" ? "default" : "outline"}
            onClick={() => setStep("year")}
          >
            Year
          </Button>
          <Button
            type="button"
            size="xs"
            variant={step === "month" ? "default" : "outline"}
            onClick={() => setStep("month")}
          >
            Month
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === "year" ? (
          <motion.div key="year" {...fade} className="h-56 overflow-y-auto pr-1">
            <div className="grid grid-cols-4 gap-1">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setYear(y);
                    setStep("month");
                  }}
                  className={cn(
                    "focus-visible:ring-ring/50 h-9 rounded-md text-sm tabular-nums transition-colors focus-visible:ring-3 focus-visible:outline-none",
                    y === year
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-muted",
                    y === today.year && y !== year ? "ring-border ring-1" : "",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}

        {step === "month" ? (
          <motion.div key="month" {...fade} className="h-56">
            <div className="grid grid-cols-3 gap-1">
              {BS_MONTHS.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setMonth(index + 1);
                    setStep("day");
                  }}
                  className={cn(
                    "focus-visible:ring-ring/50 h-12 rounded-md text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                    index + 1 === month
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-muted",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}

        {step === "day" ? (
          <motion.div key="day" {...fade} className="h-56">
            <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-1 text-center text-[11px]">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {grid ? (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: grid.firstWeekday }).map((_, i) => (
                  <span key={`blank-${i}`} />
                ))}
                {Array.from({ length: grid.length }).map((_, i) => {
                  const day = i + 1;
                  const isSelected =
                    selected?.year === year &&
                    selected?.month === month &&
                    selected?.day === day;
                  const isToday =
                    today.year === year && today.month === month && today.day === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => pick(day)}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 h-8 rounded-md text-sm tabular-nums transition-colors focus-visible:ring-3 focus-visible:outline-none",
                        isSelected
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-muted",
                        isToday && !isSelected ? "ring-border ring-1" : "",
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                That month is outside the supported range.
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between border-t pt-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {value ?? "No date chosen"}
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            setYear(today.year);
            setMonth(today.month);
            setStep("day");
            onChange(`${today.year}-${pad(today.month)}-${pad(today.day)}`);
          }}
        >
          Today
        </Button>
      </div>
    </div>
  );
}
