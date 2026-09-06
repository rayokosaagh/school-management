"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BsCalendar } from "@/components/ui/bs-calendar";
import { formatBs, parseBsInput } from "@/lib/date/bs";

// Typing stays the fast path for office staff who know the BS date; the calendar
// is there for the ones they have to work out. The Gregorian equivalent is shown
// live so a typo is caught before submitting.
export function BsDateField({
  id,
  name,
  label,
  defaultValue = "",
  required = false,
  help,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  help?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const trimmed = value.trim();
  const parsed = trimmed ? parseBsInput(trimmed) : null;
  const invalid = Boolean(trimmed) && !parsed;

  const hint = invalid
    ? "Not a valid BS date."
    : parsed
      ? `${formatBs(parsed, "YYYY MMMM DD, dddd")} · ${parsed.toISOString().slice(0, 10)}`
      : (help ?? "YYYY-MM-DD in Bikram Sambat");

  return (
    <div className="space-y-2" ref={wrap}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative flex gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="YYYY-MM-DD"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          required={required}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={open ? "Close date picker" : "Open date picker"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CalendarDays />
        </Button>

        {open ? (
          <div className="absolute top-full right-0 z-50 mt-1">
            <BsCalendar
              value={parsed ? value.trim() : null}
              onChange={(next) => {
                setValue(next);
                setOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>
      <p
        id={`${id}-hint`}
        className={invalid ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
      >
        {hint}
      </p>
    </div>
  );
}
