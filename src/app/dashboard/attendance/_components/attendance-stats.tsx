"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kpi } from "@/components/ui/kpi";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClassAttendanceDetail, ClassAttendanceStat } from "@/lib/attendance/attendance";
import { loadClassAttendanceDetail } from "../actions";
import { ClassAttendanceDetailView } from "./class-attendance-detail";

export function AttendanceStats({
  rows,
  periodLabel,
  period,
  dateLabel,
  onOpenRollCall,
}: {
  rows: ClassAttendanceStat[];
  periodLabel: string;
  period: "monthly" | "yearly";
  dateLabel: string;
  onOpenRollCall: (sectionId: number) => void;
}) {
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClassAttendanceDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  async function openClass(row: ClassAttendanceStat) {
    const request = ++requestId.current;
    setSelectedSectionId(row.sectionId);
    setDetail(null);
    setDetailError(null);
    setLoading(true);
    try {
      const result = await loadClassAttendanceDetail(row.sectionId, period, dateLabel);
      if (request !== requestId.current) return;
      setDetail(result.detail);
      setDetailError(result.error);
    } catch {
      if (request === requestId.current) {
        setDetailError("Could not load student attendance. Try again.");
      }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  function closeClass() {
    requestId.current++;
    setSelectedSectionId(null);
    setDetail(null);
    setDetailError(null);
    setLoading(false);
  }

  if (detail) {
    return (
      <ClassAttendanceDetailView
        detail={detail}
        periodLabel={periodLabel}
        onBack={closeClass}
        onOpenRollCall={onOpenRollCall}
      />
    );
  }

  if (selectedSectionId !== null) {
    const selected = rows.find((row) => row.sectionId === selectedSectionId);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon-sm" onClick={closeClass} aria-label="Back to class statistics">
            <ArrowLeft />
          </Button>
          <div>
            <p className="font-medium">{selected?.section ?? "Class attendance"}</p>
            <p className="text-ink-3 text-xs">{loading ? "Loading student attendance…" : detailError}</p>
          </div>
        </div>
        {loading ? (
          <div className="mt-4 space-y-3" role="status" aria-label="Loading class attendance">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 w-full rounded-[10px]" />)}
          </div>
        ) : null}
      </div>
    );
  }

  const totals = rows.reduce(
    (sum, row) => ({
      present: sum.present + row.present,
      absent: sum.absent + row.absent,
      late: sum.late + row.late,
      leave: sum.leave + row.leave,
      days: sum.days + row.daysRecorded,
    }),
    { present: 0, absent: 0, late: 0, leave: 0, days: 0 },
  );
  const recorded = totals.present + totals.absent + totals.late + totals.leave;
  const rate = recorded === 0 ? null : Math.round(((totals.present + totals.late) / recorded) * 100);
  const reporting = rows.filter((row) => row.daysRecorded > 0).length;
  const statCard = "shadow-[inset_3px_0_0_var(--ok)]";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi className={statCard} value={rate === null ? "—" : `${rate}%`} label="Attendance rate" hint={periodLabel} />
        <Kpi className={statCard} value={`${reporting}/${rows.length}`} label="Classes reporting" hint="At least one roll call" />
        <Kpi className={statCard} value={totals.days} label="Class-days recorded" hint="Roll calls across all classes" />
        <Kpi className={statCard} value={recorded} label="Student records" hint="All attendance marks" />
      </div>

      <div className="border-line mt-4 overflow-hidden rounded-[10px] border">
        <div className="border-line border-b px-4 py-3">
          <p className="font-medium">Attendance by class</p>
          <p className="text-ink-3 mt-0.5 text-xs">{periodLabel} · present and late count as attended</p>
        </div>
        <Table className="min-w-[820px]">
          <TableHeader className="bg-surface-2">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-ink-3 h-9 pl-4 text-[11.5px] tracking-[0.04em] uppercase">Class</TableHead>
              <TableHead className="text-ink-3 h-9 text-right text-[11.5px] tracking-[0.04em] uppercase">Students</TableHead>
              <TableHead className="text-ink-3 h-9 text-right text-[11.5px] tracking-[0.04em] uppercase">Days</TableHead>
              <TableHead className="text-ink-3 h-9 text-right text-[11.5px] tracking-[0.04em] uppercase"><StatusLabel tone="bg-ok">Present</StatusLabel></TableHead>
              <TableHead className="text-ink-3 h-9 text-right text-[11.5px] tracking-[0.04em] uppercase"><StatusLabel tone="bg-bad">Absent</StatusLabel></TableHead>
              <TableHead className="text-ink-3 h-9 text-right text-[11.5px] tracking-[0.04em] uppercase"><StatusLabel tone="bg-warn">Late</StatusLabel></TableHead>
              <TableHead className="text-ink-3 h-9 text-right text-[11.5px] tracking-[0.04em] uppercase"><StatusLabel tone="bg-brand">Leave</StatusLabel></TableHead>
              <TableHead className="text-ink-3 h-9 pr-4 text-right text-[11.5px] tracking-[0.04em] uppercase">Attendance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.sectionId}
                role="button"
                tabIndex={0}
                onClick={() => openClass(row)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  openClass(row);
                }}
                className="border-line cursor-pointer hover:bg-surface-2 focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:outline-none"
              >
                <TableCell className="h-12 pl-4 font-medium">
                  <span className="flex items-center gap-1.5">
                    {row.section}
                    <ChevronRight className="text-ink-3 size-3.5" aria-hidden="true" />
                  </span>
                </TableCell>
                <TableCell className="h-12 text-right font-mono text-xs tabular-nums">{row.students}</TableCell>
                <TableCell className="h-12 text-right font-mono text-xs tabular-nums">{row.daysRecorded}</TableCell>
                <TableCell className="h-12 text-right font-mono text-xs tabular-nums">{row.present}</TableCell>
                <TableCell className="h-12 text-right font-mono text-xs tabular-nums">{row.absent}</TableCell>
                <TableCell className="h-12 text-right font-mono text-xs tabular-nums">{row.late}</TableCell>
                <TableCell className="h-12 text-right font-mono text-xs tabular-nums">{row.leave}</TableCell>
                <TableCell className="h-12 pr-4">
                  <AttendanceRate value={row.rate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 ? (
          <p className="text-ink-3 px-4 py-8 text-center text-sm">No classes are available for this academic year.</p>
        ) : null}
      </div>
    </div>
  );
}

function StatusLabel({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className={`size-1.5 rounded-full ${tone}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function AttendanceRate({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-3 block text-right text-xs">No data</span>;
  return (
    <div className="ml-auto w-24" role="progressbar" aria-label="Attendance rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span className="mb-1 block text-right font-mono text-xs font-medium tabular-nums">{value}%</span>
      <div className="bg-surface-2 h-1 overflow-hidden rounded-full">
        <div className="bg-ok h-full rounded-full" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
