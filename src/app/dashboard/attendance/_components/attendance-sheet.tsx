"use client";

import { Fragment, useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ActionState, saveAttendance } from "../actions";

const EMPTY: ActionState = {};

const STATUSES = [
  { value: "PRESENT", label: "P", title: "Present" },
  { value: "ABSENT", label: "A", title: "Absent" },
  { value: "LATE", label: "L", title: "Late" },
  { value: "LEAVE", label: "Lv", title: "Leave" },
] as const;

export type SheetRow = {
  studentId: number;
  fullName: string;
  rollNo: number;
  status: string;
  note: string | null;
};

export function AttendanceSheet({
  sectionId,
  date,
  rows,
  taken,
}: {
  sectionId: number;
  date: string;
  rows: SheetRow[];
  taken: boolean;
}) {
  const [state, action, pending] = useToastedActionState(saveAttendance, EMPTY);
  const [statuses, setStatuses] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.status])),
  );
  const [notes, setNotes] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.note ?? ""])),
  );

  const set = (studentId: number, value: string) =>
    setStatuses((prev) => ({ ...prev, [studentId]: value }));

  const setAll = (value: string) =>
    setStatuses(Object.fromEntries(rows.map((r) => [r.studentId, value])));

  const absent = rows.filter((r) => statuses[r.studentId] === "ABSENT").length;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="date" value={date} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setAll("PRESENT")}>
          All present
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setAll("ABSENT")}>
          All absent
        </Button>
        <span className="text-muted-foreground text-xs">
          {rows.length} on roll · {absent} marked absent
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="w-12 py-2 pr-3 font-medium">Roll</th>
              <th className="py-2 pr-3 font-medium">Name</th>
              {STATUSES.map((s) => (
                <th key={s.value} className="w-12 py-2 text-center font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.studentId}>
                <tr className={statuses[row.studentId] === "LEAVE" ? "" : "border-b"}>
                  <td className="py-1.5 pr-3 tabular-nums">{row.rollNo}</td>
                  <td className="py-1.5 pr-3">{row.fullName}</td>
                  {STATUSES.map((s) => (
                    <td key={s.value} className="py-1.5 text-center">
                      <input
                        type="radio"
                        name={`status-${row.studentId}`}
                        value={s.value}
                        title={s.title}
                        aria-label={`${row.fullName}: ${s.title}`}
                        checked={statuses[row.studentId] === s.value}
                        onChange={() => set(row.studentId, s.value)}
                        className="size-4"
                      />
                    </td>
                  ))}
                </tr>
                {statuses[row.studentId] === "LEAVE" ? (
                  <tr className="border-b">
                    <td />
                    <td colSpan={5} className="pb-2">
                      <Input
                        name={`note-${row.studentId}`}
                        value={notes[row.studentId] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [row.studentId]: e.target.value,
                          }))
                        }
                        placeholder="Reason for leave"
                        maxLength={200}
                        aria-label={`Reason ${row.fullName} is on leave`}
                        className="h-8 max-w-md text-sm"
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : taken ? "Update attendance" : "Save attendance"}
        </Button>
        {state.error ? (
          <p className="text-destructive text-sm">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="text-muted-foreground text-sm">{state.success}</p>
        ) : null}
      </div>
    </form>
  );
}
