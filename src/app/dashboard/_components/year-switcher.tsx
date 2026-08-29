"use client";

import { startTransition, useRef, useState } from "react";
import Link from "next/link";
import { CalendarRange, TriangleAlert } from "lucide-react";
import { useToastedActionState } from "@/components/ui/toast";
import { FieldSelect } from "@/components/ui/select";
import { switchAcademicYear, type YearState } from "../actions";

const EMPTY: YearState = {};

// The current year gates nearly every page, so switching it belongs in the shell
// rather than buried on the Classes page.
export function YearSwitcher({
  years,
  currentId,
  span,
  todayInYear,
}: {
  years: { id: number; nameBS: string; sections: number }[];
  currentId: number | null;
  /** The Gregorian span of the current year, shown beneath the control. */
  span: string | null;
  /** False when today falls outside the selected year — worth flagging. */
  todayInYear: boolean;
}) {
  const [, action, pending] = useToastedActionState(switchAcademicYear, EMPTY);
  const card = useRef<HTMLDivElement>(null);
  const [yearId, setYearId] = useState(currentId === null ? "" : String(currentId));
  const [lastFromServer, setLastFromServer] = useState(currentId);

  // The year can also change from the Classes page, another tab, or a failed
  // switch. Following the server value keeps this control from claiming a year
  // the rest of the app is not using.
  if (currentId !== lastFromServer) {
    setLastFromServer(currentId);
    setYearId(currentId === null ? "" : String(currentId));
  }

  // Calling the action with data built here, rather than submitting a form:
  // it runs only on a real choice, and never on mount.
  function choose(next: string | null) {
    if (!next || next === yearId) return;
    setYearId(next);
    const data = new FormData();
    data.set("academicYearId", next);
    // In a transition so the control's pending state still tracks the call.
    startTransition(() => action(data));
  }

  if (years.length === 0) {
    return (
      <Link
        href="/dashboard/classes"
        className="bg-tint-amber text-tint-amber-fg inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
      >
        <TriangleAlert className="size-4" />
        Add an academic year
      </Link>
    );
  }

  return (
    <div className="relative shrink-0">
      <div
        ref={card}
        className={[
          "border-line hover:bg-page flex h-8 items-center gap-2 rounded-lg border border-transparent px-2.5",
          "focus-within:ring-ring focus-within:ring-2",
          pending ? "opacity-60" : "",
        ].join(" ")}
      >
        <span className="bg-tint-violet text-tint-violet-fg grid size-8 shrink-0 place-items-center rounded-lg">
          <CalendarRange className="size-4" aria-hidden="true" />
        </span>

        <span className="min-w-0">
          <span className="text-muted-foreground block text-[10px] leading-none tracking-wider uppercase">
            Academic year
          </span>
          <FieldSelect
            id="shell-year"
            name="academicYearId"
            aria-label="Academic year"
            value={yearId}
            onValueChange={choose}
            disabled={pending}
            options={[
              ...(currentId === null
                ? [{ value: "", label: "None set", disabled: true }]
                : []),
              // Saying so in the option itself, because switching into an empty
              // year blanks every page and that looks like a fault.
              ...years.map((y) => ({
                value: String(y.id),
                label: y.sections === 0 ? `${y.nameBS} · not set up` : y.nameBS,
              })),
            ]}
            anchor={card}
            className="h-auto w-auto gap-1 border-0 bg-transparent p-0 text-sm font-semibold tabular-nums shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
          />
        </span>

        {span ? (
          <span className="text-muted-foreground hidden border-l pl-2.5 text-xs tabular-nums shell:inline">
            {span}
          </span>
        ) : null}

        {/* Marking a year current that today falls outside of is legitimate when
            reviewing last year, but it is worth saying so out loud. */}
        {currentId !== null && !todayInYear ? (
          <span
            className="bg-tint-amber text-tint-amber-fg rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
            title="Today's date falls outside this academic year"
          >
            Past year
          </span>
        ) : null}
      </div>
    </div>
  );
}
