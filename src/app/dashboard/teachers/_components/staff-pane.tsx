"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { ChevronRight, KeyRound, Pencil, Phone, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailPane } from "@/components/ui/detail-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import type { StaffSummary } from "@/lib/registry/staff";
import { StaffDetail, type StaffRow } from "./staff-detail";
import { StaffPhotoForm } from "./photo-form";

/// The same code badge the register tab strips use, so a class reads the
/// same here as it does there.
const CLASS_CHIP =
  "border-line bg-page text-ink-3 rounded border px-1.5 py-px font-mono text-caption tracking-[0.04em]";

/// Shared with the table so a status reads the same in both places.
export function StaffStatus({ isActive }: { isActive: boolean }) {
  return <StatusDot tone={isActive ? "ok" : "neutral"}><TranslatedText>{isActive ? "Active" : "Inactive"}</TranslatedText></StatusDot>;
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
/// Both the sections led and the teaching load repeat themselves once per
/// academic year, and a teacher who does the same job two years running had
/// every line printed twice at full weight. The selected year leads; the rest
/// fold away behind one line, because they are history rather than news.
function OtherYears({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="mt-3">
      <Button
        size="xs"
        variant="ghost"
        className="text-ink-3 -ml-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight
          aria-hidden="true"
          data-icon="inline-start"
          className={cn("transition-transform", open && "rotate-90")}
        />
        <TranslatedText>{count === 1 ? "1 other year" : `${count} other years`}</TranslatedText>
      </Button>
      {open ? <div className="mt-2.5 space-y-3.5">{children}</div> : null}
    </div>
  );
}

/// A subject's reach across the school, drawn rather than listed.
///
/// Fourteen class codes wrapped over two lines told you which classes but not
/// what shape the load was. Laid on the year's own grade ladder, a teacher who
/// covers the school and one who only takes the top two grades are different
/// pictures before you read a word — and two staff can be compared by glancing
/// at the same rungs in the same places.
function ReachBar({
  ladder,
  classes,
}: {
  ladder: { name: string; code: string }[];
  classes: { code: string; label: string; gradeName: string; gradeOrder: number }[];
}) {
  // Sections taught, keyed by the grade they sit in.
  const taught = new Map<string, string[]>();
  for (const c of classes) {
    const sections = taught.get(c.gradeName) ?? [];
    sections.push(c.label);
    taught.set(c.gradeName, sections);
  }
  const covered = ladder.filter((g) => taught.has(g.name)).length;

  return (
    <div className="mt-1.5">
      <ul className="flex items-stretch gap-px" aria-label="Grades taught">
        {ladder.map((g) => {
          const sections = taught.get(g.name);
          return (
            <li
              key={g.name}
              className={cn(
                "flex-1 rounded-[3px] py-1 text-center font-mono text-caption leading-none tracking-[0.02em] first:rounded-l-md last:rounded-r-md",
                sections
                  ? "bg-brand-tint text-brand-text font-medium"
                  : "bg-surface-2 text-ink-3/45",
              )}
            >
              <span aria-hidden="true">{g.code}</span>
              <span className="sr-only">
                {sections ? sections.join(", ") : `${g.name} — not taught`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-ink-3 mt-1 text-caption">
        {covered}<TranslatedText> of </TranslatedText>{ladder.length}<TranslatedText> grades
        </TranslatedText>{classes.length > covered ? ` · ${classes.length} classes` : null}
      </p>
    </div>
  );
}

export function StaffPane({ summary, row, onClose, canManageAccounts, yearLabel, ladder }: { summary: StaffSummary; row: StaffRow; onClose?: () => void; canManageAccounts: boolean; yearLabel: string | null; ladder: { name: string; code: string }[] }) {
  const [editing, setEditing] = useState(false);
  // Anything not in the selected year is folded away rather than dropped.
  const ledNow = summary.sectionsLed.filter((s) => s.year === yearLabel);
  const ledThen = summary.sectionsLed.filter((s) => s.year !== yearLabel);
  const loadNow = summary.load.filter((y) => y.year === yearLabel);
  const loadThen = summary.load.filter((y) => y.year !== yearLabel);
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
          <img src={`/api/photo/${summary.photoId}`} alt="" className="size-13 shrink-0 rounded-xl object-cover object-top" />
        ) : undefined
      }
      actions={
        <>
          <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => setEditing((v) => !v)}>
            {editing ? <X data-icon="inline-start" aria-hidden="true" /> : <Pencil data-icon="inline-start" aria-hidden="true" />}
            <TranslatedText>{editing ? "Cancel" : "Edit"}</TranslatedText>
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<a href={`tel:${summary.phone}`} />}>
            <Phone data-icon="inline-start" aria-hidden="true" /><TranslatedText>
            Call
          </TranslatedText></Button>
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
                // An email row reading "—" under a sign-in row reading "No
                // account" is one fact spread over two cells.
                ...(summary.account ? [{ label: "Email", value: summary.account.email ?? "—" }] : []),
              ]}
            />
            {/* Creating the account itself stays in Settings, where the roles,
                the permission matrix and the rest of the accounts already
                live. This is the shortcut to it, carrying the staff id so the
                form opens on the person whose pane it was clicked from. The
                button is hidden without the capability because Settings would
                only bounce them back to the overview. */}
            {summary.account === null && canManageAccounts ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                nativeButton={false}
                render={<Link href={`/dashboard/settings?view=privacy&staff=${summary.staffId}`} />}
              >
                <KeyRound data-icon="inline-start" aria-hidden="true" /><TranslatedText>
                Set up sign-in
              </TranslatedText></Button>
            ) : null}
          </DetailPane.Section>

          <DetailPane.Section label="Class teacher of">
            {summary.sectionsLed.length === 0 ? <p className="text-ink-3 text-sm"><TranslatedText>Not a class teacher.</TranslatedText></p> : (
              <>
                {ledNow.length === 0 ? (
                  <p className="text-ink-3 text-sm"><TranslatedText>Not a class teacher this year.</TranslatedText></p>
                ) : (
                  // The year is the section's own heading now, so it is not
                  // repeated against every line.
                  <ul className="space-y-1 text-label">{ledNow.map((s) => <li key={s.id}>{s.label}</li>)}</ul>
                )}
                <OtherYears count={ledThen.length === 0 ? 0 : 1}>
                  <ul className="space-y-1 text-label">{ledThen.map((s) => <li key={s.id}>{s.label} <span className="text-ink-3">· {s.year}</span></li>)}</ul>
                </OtherYears>
              </>
            )}
          </DetailPane.Section>

          <DetailPane.Section label="Teaching load">
            {summary.load.length === 0 ? <p className="text-ink-3 text-sm"><TranslatedText>No subjects assigned.</TranslatedText></p> : (
              <>
                {loadNow.length === 0 ? (
                  <p className="text-ink-3 text-sm"><TranslatedText>No subjects this year.</TranslatedText></p>
                ) : null}
                {loadNow.map((y) => (
                  <div key={y.year}>
                    <p className="text-ink-3 mb-2 flex items-baseline justify-between gap-2 font-mono text-caption">
                      <span>{y.year}</span>
                      <span>
                        {y.subjectCount} <TranslatedText>{y.subjectCount === 1 ? "subject" : "subjects"}</TranslatedText> · {y.classCount}<TranslatedText>{" "}</TranslatedText>
                        <TranslatedText>{y.classCount === 1 ? "class" : "classes"}</TranslatedText>
                      </span>
                    </p>
                    <ul className="space-y-2.5">
                      {y.subjects.map((s) => (
                        <li key={s.subject}>
                          <p className="text-label font-medium">{s.subject}</p>
                          {ladder.length > 0 ? (
                            <ReachBar ladder={ladder} classes={s.classes} />
                          ) : (
                            // No ladder to draw against — a year with no
                            // sections yet. The codes still say which classes.
                            <ul className="mt-1 flex flex-wrap gap-1">
                              {s.classes.map((c) => (
                                <li key={c.code} className={CLASS_CHIP}>
                                  <span aria-hidden="true">{c.code}</span>
                                  <span className="sr-only">{c.label}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <OtherYears count={loadThen.length}>
                  {loadThen.map((y) => (
                    <div key={y.year}>
                      <p className="text-ink-3 mb-2 flex items-baseline justify-between gap-2 font-mono text-caption">
                        <span>{y.year}</span>
                        <span>
                          {y.subjectCount} <TranslatedText>{y.subjectCount === 1 ? "subject" : "subjects"}</TranslatedText> · {y.classCount}<TranslatedText>{" "}</TranslatedText>
                          <TranslatedText>{y.classCount === 1 ? "class" : "classes"}</TranslatedText>
                        </span>
                      </p>
                      <ul className="space-y-2.5">
                        {y.subjects.map((s) => (
                          <li key={s.subject}>
                            <p className="text-label font-medium">{s.subject}</p>
                            <ul className="mt-1 flex flex-wrap gap-1">
                              {s.classes.map((c) => (
                                <li key={c.code} className={CLASS_CHIP}>
                                  <span aria-hidden="true">{c.code}</span>
                                  <span className="sr-only">{c.label}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </OtherYears>
              </>
            )}
          </DetailPane.Section>

          <DetailPane.Section label="Roll calls">
            <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {summary.rollCallsTaken}
              <span className="font-body text-ink-3 ml-1.5 text-label font-normal tracking-normal"><TranslatedText>taken in total</TranslatedText></span>
            </p>
          </DetailPane.Section>
        </>
      )}
    </DetailPane>
  );
}
