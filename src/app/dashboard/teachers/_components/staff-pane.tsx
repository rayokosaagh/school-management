"use client";

import { Pencil, Phone, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailPane } from "@/components/ui/detail-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import type { StaffSummary } from "@/lib/registry/staff";
import { StaffDetail, type StaffRow } from "./staff-detail";
import { StaffPhotoForm } from "./photo-form";

/// Shared with the table so a status reads the same in both places.
export function StaffStatus({ isActive }: { isActive: boolean }) {
  return <StatusDot tone={isActive ? "ok" : "neutral"}>{isActive ? "Active" : "Inactive"}</StatusDot>;
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function StaffPaneSkeleton() {
  return (
    <div className="space-y-4 p-5" role="status" aria-busy="true" aria-label="Loading staff member">
      <div className="flex gap-3"><Skeleton className="size-13 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3.5 w-1/2" /></div></div>
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );
}

/// The right-hand pane: read view by default, the existing editor in place
/// when "Edit" is pressed. `row` is the table row's editable shape; `summary`
/// is the server-rendered aggregate for the same person.
export function StaffPane({ summary, row, onClose }: { summary: StaffSummary; row: StaffRow; onClose?: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <DetailPane
      title={summary.fullName}
      subtitle={<>{summary.fullNameNp ? <span className="font-devanagari text-ink-2">{summary.fullNameNp} · </span> : null}{summary.designation}</>}
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
          <Button size="sm" variant="outline" nativeButton={false} render={<a href={`tel:${summary.phone}`} />}>
            <Phone data-icon="inline-start" aria-hidden="true" />
            Call
          </Button>
          {onClose ? <Button size="sm" variant="ghost" className="ml-auto" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></Button> : null}
        </>
      }
    >
      {editing ? (
        // The upload form squeezes the header at 340px, so it lives in edit
        // mode: the header keeps the photo itself, or the initials tile.
        <>
          <DetailPane.Section label="Photo">
            <StaffPhotoForm staffId={summary.staffId} photoId={summary.photoId} name={summary.fullName} />
          </DetailPane.Section>
          <div className="p-5"><StaffDetail row={row} onDone={() => setEditing(false)} /></div>
        </>
      ) : (
        <>
          <DetailPane.Section label="Record">
            <DetailPane.Facts
              items={[
                { label: "Designation", value: summary.designation },
                { label: "Status", value: <StaffStatus isActive={summary.isActive} /> },
                { label: "Phone", value: summary.phone, mono: true },
                { label: "Joined (BS)", value: summary.joinedOnBs, mono: true },
                { label: "Sign-in", value: summary.account ? summary.account.username : "No account" },
                { label: "Email", value: summary.account?.email ?? "—" },
              ]}
            />
          </DetailPane.Section>

          <DetailPane.Section label="Class teacher of">
            {summary.sectionsLed.length === 0 ? <p className="text-ink-3 text-sm">Not a class teacher.</p> : (
              <ul className="space-y-1 text-[12.5px]">{summary.sectionsLed.map((s) => <li key={s.id}>{s.label} <span className="text-ink-3">· {s.year}</span></li>)}</ul>
            )}
          </DetailPane.Section>

          <DetailPane.Section label="Teaching load">
            {summary.load.length === 0 ? <p className="text-ink-3 text-sm">No subjects assigned.</p> : summary.load.map((y) => (
              <div key={y.year} className="mb-2 last:mb-0">
                <p className="text-ink-3 mb-1 font-mono text-[11.5px]">{y.year} · {y.items.length} {y.items.length === 1 ? "subject" : "subjects"}</p>
                <ul className="space-y-0.5 text-[12.5px]">{y.items.map((it, i) => <li key={`${it.section}-${it.subject}-${i}`}>{it.subject} <span className="text-ink-3">· {it.section}</span></li>)}</ul>
              </div>
            ))}
          </DetailPane.Section>

          <DetailPane.Section label="Roll calls">
            <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {summary.rollCallsTaken}
              <span className="font-body text-ink-3 ml-1.5 text-[12.5px] font-normal tracking-normal">taken in total</span>
            </p>
          </DetailPane.Section>
        </>
      )}
    </DetailPane>
  );
}
