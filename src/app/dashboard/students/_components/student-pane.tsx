"use client";

import { Pencil, Phone, X } from "lucide-react";
import { useState } from "react";
import { AttendanceStrip } from "@/components/ui/attendance-strip";
import { Button } from "@/components/ui/button";
import { DetailPane } from "@/components/ui/detail-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import type { StudentSummary } from "@/lib/registry/students";
import { StudentDetail, type StudentDetailData } from "./student-detail";
import { StudentPhotoForm } from "./photo-form";

const RELATION: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian" };
const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
/// Shared with the table so a status reads the same in both places.
export const STATUS_TONE: Record<string, "ok" | "neutral" | "warn"> = { ACTIVE: "ok", LEFT: "neutral", GRADUATED: "warn" };
export const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", LEFT: "Left", GRADUATED: "Graduated" };

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function StudentPaneSkeleton() {
  return (
    <div className="space-y-4 p-5" role="status" aria-busy="true" aria-label="Loading student">
      <div className="flex gap-3"><Skeleton className="size-13 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3.5 w-1/2" /></div></div>
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );
}

/// The right-hand pane: read view by default, the existing editor in place
/// when "Edit" is pressed. `detail` is the row's editable shape; `summary`
/// is the server-rendered aggregate for the same student.
export function StudentPane({
  summary,
  detail,
  sections,
  academicYearId,
  onClose,
}: {
  summary: StudentSummary;
  detail: StudentDetailData;
  sections: { id: number; name: string; grade: { name: string } }[];
  academicYearId: number;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const primary = summary.guardians.find((g) => g.isPrimary) ?? summary.guardians[0] ?? null;

  return (
    <DetailPane
      title={summary.fullName}
      subtitle={
        <>
          {summary.fullNameNp ? <span className="font-devanagari text-ink-2">{summary.fullNameNp} · </span> : null}
          {/* The page redirects when there is no current-year enrolment, so the
              pane never opens without one. */}
          {summary.enrollment ? <>{summary.enrollment.sectionLabel} · Roll <span className="font-mono">{summary.enrollment.rollNo}</span></> : null}
        </>
      }
      initials={initialsOf(summary.fullName)}
      photo={
        summary.photoId ? (
          // Served from our own route; next/image would add no value for a
          // one-off private thumbnail. Falls back to the initials tile.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photo/${summary.photoId}`} alt="" className="size-13 shrink-0 rounded-xl object-cover" />
        ) : undefined
      }
      actions={
        <>
          <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => setEditing((v) => !v)}>
            {editing ? <X data-icon="inline-start" aria-hidden="true" /> : <Pencil data-icon="inline-start" aria-hidden="true" />}
            {editing ? "Cancel" : "Edit"}
          </Button>
          {primary ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`tel:${primary.phone}`} />}>
              <Phone data-icon="inline-start" aria-hidden="true" />
              Call guardian
            </Button>
          ) : null}
          {onClose ? <Button size="sm" variant="ghost" className="ml-auto" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></Button> : null}
        </>
      }
    >
      {editing ? (
        // The upload form squeezes the header at 340px, so it lives in edit
        // mode: the header keeps the photo itself, or the initials tile.
        <>
          <DetailPane.Section label="Photo">
            <StudentPhotoForm studentId={summary.studentId} photoId={summary.photoId} name={summary.fullName} />
          </DetailPane.Section>
          <div className="p-5">
            <StudentDetail data={detail} sections={sections} academicYearId={academicYearId} onDone={() => setEditing(false)} />
          </div>
        </>
      ) : (
        <>
          <DetailPane.Section label="Record">
            <DetailPane.Facts
              items={[
                { label: "Admission no.", value: summary.admissionNo, mono: true },
                { label: "Status", value: <StatusDot tone={STATUS_TONE[summary.status] ?? "neutral"}>{STATUS_LABEL[summary.status] ?? summary.status}</StatusDot> },
                { label: "Born (BS)", value: summary.dobBs, mono: true },
                { label: "Born (AD)", value: summary.dobAd, mono: true },
                { label: "Gender", value: GENDER[summary.gender] ?? summary.gender },
                { label: "Address", value: summary.address ?? "—" },
                { label: "Admitted (BS)", value: summary.admittedOnBs, mono: true },
              ]}
            />
          </DetailPane.Section>

          <DetailPane.Section label={summary.guardians.length === 1 ? "Guardian" : "Guardians"}>
            <ul className="space-y-2">
              {summary.guardians.map((g) => (
                <li key={g.id} className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.fullName} <span className="text-ink-3 font-normal">· {RELATION[g.relation] ?? g.relation}{g.isPrimary ? " · primary" : ""}</span></p>
                    <p className="text-ink-3 font-mono text-xs tabular-nums">{g.phone}{g.occupation ? ` · ${g.occupation}` : ""}</p>
                  </div>
                </li>
              ))}
              {summary.guardians.length === 0 ? <li className="text-ink-3 text-sm">No guardian on record.</li> : null}
            </ul>
          </DetailPane.Section>

          <DetailPane.Section label="Attendance this year">
            <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {summary.attendance.percent == null ? "—" : `${summary.attendance.percent}%`}
              <span className="font-body text-ink-3 ml-1.5 text-[12.5px] font-normal tracking-normal">
                {summary.attendance.recorded === 0 ? "no roll calls yet" : `present · ${summary.attendance.recorded} days recorded`}
              </span>
            </p>
            <AttendanceStrip days={summary.attendance.days} size="lg" className="mt-2 w-full" />
          </DetailPane.Section>

          <DetailPane.Section label="Marks">
            {summary.exams.length === 0 ? (
              <p className="text-ink-3 text-sm">No marks entered this year.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.exams.map((e) => (
                  <li key={e.termId} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 text-[12.5px]">
                    <span>
                      {e.name}{" "}
                      <StatusDot tone={e.isPublished ? "ok" : "neutral"} className="ml-1">{e.isPublished ? "Published" : "Draft"}</StatusDot>
                    </span>
                    <span className="bg-line h-1.5 w-[90px] overflow-hidden rounded-full" aria-hidden="true">
                      <i className="bg-brand block h-full" style={{ width: `${e.percent ?? 0}%` }} />
                    </span>
                    <span className="w-10 text-right font-mono tabular-nums">{e.percent == null ? "—" : `${e.percent}%`}</span>
                  </li>
                ))}
              </ul>
            )}
          </DetailPane.Section>

          <DetailPane.Section label="History">
            <ul className="space-y-1.5 text-[12.5px]">
              {summary.history.map((h) => (
                <li key={`${h.year}-${h.sectionLabel}`}>
                  <span className="text-ink-3 font-mono tabular-nums">{h.enrolledOnBs}</span>&nbsp;&nbsp;{h.year} · {h.sectionLabel}, roll {h.rollNo}
                </li>
              ))}
            </ul>
          </DetailPane.Section>
        </>
      )}
    </DetailPane>
  );
}
