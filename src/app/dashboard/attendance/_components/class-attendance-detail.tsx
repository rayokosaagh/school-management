"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { ArrowLeft, CalendarCheck, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AttendanceMap } from "@/components/ui/attendance-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonName, personSearch } from "@/components/ui/person-name";
import { Segmented } from "@/components/ui/segmented";
import { StatusDot } from "@/components/ui/status-dot";
import { StudentAvatar } from "@/components/ui/student-avatar";
import type { ClassAttendanceDetail, StudentAttendanceStat } from "@/lib/attendance/attendance";
import { toBsInput } from "@/lib/date/bs";

type Filter = "all" | "attention" | "notes";

export function ClassAttendanceDetailView({
  detail,
  periodLabel,
  onBack,
  onOpenRollCall,
}: {
  detail: ClassAttendanceDetail;
  periodLabel: string;
  onBack: () => void;
  onOpenRollCall: (sectionId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const attention = detail.students.filter(needsAttention).length;
  const withNotes = detail.students.filter((student) => student.notes.length > 0).length;

  const students = useMemo(() => {
    const q = query.trim().toLowerCase();
    return detail.students.filter((student) => {
      if (filter === "attention" && !needsAttention(student)) return false;
      if (filter === "notes" && student.notes.length === 0) return false;
      return (
        !q ||
        `${personSearch(student.fullName, student.fullNameNp)} ${student.admissionNo} ${student.rollNo}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [detail.students, filter, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to class statistics">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{detail.section}</p>
          <p className="text-ink-3 text-xs">{periodLabel} · {detail.daysRecorded}<TranslatedText> roll call</TranslatedText><TranslatedText>{detail.daysRecorded === 1 ? "" : "s"}</TranslatedText></p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenRollCall(detail.sectionId)}>
          <CalendarCheck data-icon="inline-start" aria-hidden="true" /><TranslatedText>
          Open roll call
        </TranslatedText></Button>
      </div>

      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-2.5 sm:max-w-xs">
          <Search className="size-3.5" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students"
            aria-label="Search students"
            className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: detail.students.length },
            { value: "attention", label: "Needs attention", count: attention },
            { value: "notes", label: "Has notes", count: withNotes },
          ]}
          ariaLabel="Student attendance filter"
        />
        <span className="text-ink-3 ml-auto text-xs">{students.length}<TranslatedText> shown</TranslatedText></span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {students.length === 0 ? (
          <p className="text-ink-3 py-8 text-center text-sm"><TranslatedText>No students match this view.</TranslatedText></p>
        ) : (
          <ul className="space-y-3">
            {students.map((student) => (
              <StudentAttendanceCard key={student.studentId} student={student} to={detail.to} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function needsAttention(student: StudentAttendanceStat) {
  return student.absent > 0 || student.late > 0 || student.leave > 0;
}

function StudentAttendanceCard({ student, to }: { student: StudentAttendanceStat; to: Date }) {
  return (
    <li className="border-line bg-surface rounded-[10px] border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <StudentAvatar photoId={student.photoId} name={student.fullName} className="size-9 rounded-lg text-xs" />
        <div className="min-w-0 flex-1">
          <PersonName en={student.fullName} np={student.fullNameNp} className="text-sm" />
          <p className="text-ink-3 text-[11.5px]"><TranslatedText>Roll </TranslatedText><span className="font-mono">{student.rollNo}</span> · {student.admissionNo} · {studentStatusLabel(student.status)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusDot tone="ok">{student.present}<TranslatedText> present</TranslatedText></StatusDot>
          <StatusDot tone="bad">{student.absent}<TranslatedText> absent</TranslatedText></StatusDot>
          <StatusDot tone="warn">{student.late}<TranslatedText> late</TranslatedText></StatusDot>
          <StatusDot tone="brand">{student.leave}<TranslatedText> leave</TranslatedText></StatusDot>
          <span className="font-mono text-sm font-semibold tabular-nums"><TranslatedText>{student.rate === null ? "—" : `${student.rate}%`}</TranslatedText></span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href={`/dashboard/students?student=${student.studentId}`} />}
          aria-label={`Open ${student.fullName}'s student record`}
          title="Open student record"
        >
          <ExternalLink aria-hidden="true" />
        </Button>
      </div>

      {student.from <= to ? (
        <div className="mt-3">
          <AttendanceMap
            from={student.from}
            to={to}
            variant="status"
            caption={student.rate === null ? "No attendance recorded" : `${student.rate}% attended`}
            days={student.days.map((day) => ({
              date: day.date,
              rate: day.status === "PRESENT" ? 1 : day.status === "LATE" ? 0.9 : day.status === "LEAVE" ? 0.5 : 0,
              status: day.status,
              label: `${statusLabel(day.status)}${day.note ? ` — ${day.note}` : ""}`,
            }))}
          />
        </div>
      ) : (
        <p className="text-ink-3 mt-3 text-xs"><TranslatedText>Not enrolled during this period.</TranslatedText></p>
      )}

      {student.notes.length > 0 ? (
        <div className="border-line mt-3 border-t pt-3">
          <p className="text-ink-3 mb-1.5 text-[11px] font-medium tracking-[0.08em] uppercase"><TranslatedText>
            Notes · </TranslatedText>{student.notes.length}
          </p>
          <ul className="space-y-1.5">
            {student.notes.map((note) => (
              <li key={`${note.date.toISOString()}-${note.note}`} className="bg-surface-2 rounded-lg px-3 py-2 text-xs">
                <span className="text-ink-3 mr-2 font-mono tabular-nums">{toBsInput(note.date)}</span>
                <span className="font-medium">{statusLabel(note.status)}</span>
                <span className="text-ink-3"> · {note.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function statusLabel(status: StudentAttendanceStat["days"][number]["status"]) {
  return status[0] + status.slice(1).toLowerCase();
}

function studentStatusLabel(status: string) {
  return status[0] + status.slice(1).toLowerCase();
}
