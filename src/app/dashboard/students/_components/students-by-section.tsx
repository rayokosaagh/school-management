"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Pencil, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldSelect } from "@/components/ui/select";
import { RailNav, type RailItem } from "@/components/ui/rail-nav";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { StatusPill, type Tone } from "@/components/ui/record-table";
import { useToastedActionState } from "@/components/ui/toast";
import { shortGrade } from "@/lib/registry/grade-label";
import { type ActionState, removeStudent } from "../actions";
import { StudentDetail } from "./student-detail";
import type { StudentRow } from "./students-view";

const EMPTY: ActionState = {};

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "positive",
  LEFT: "critical",
  GRADUATED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  LEFT: "Left",
  GRADUATED: "Graduated",
};

// One section at a time. A hundred students in a single scroll is the thing
// this replaces.

export function StudentsBySection({
  rows,
  sections,
  academicYearId,
}: {
  rows: StudentRow[];
  sections: { id: number; name: string; grade: { name: string } }[];
  academicYearId: number;
}) {
  const groups = useMemo(() => {
    const byId = new Map<number, StudentRow[]>();
    for (const row of rows) {
      const list = byId.get(row.sectionId) ?? [];
      list.push(row);
      byId.set(row.sectionId, list);
    }
    return byId;
  }, [rows]);

  const items: RailItem[] = sections.map((section) => ({
    key: String(section.id),
    badge: `${shortGrade(section.grade.name)}${section.name}`,
    label: `${section.grade.name} ${section.name}`,
    count: groups.get(section.id)?.length ?? 0,
  }));

  const [selected, setSelected] = useState<string | null>(items[0]?.key ?? null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<StudentRow | null>(null);

  const [, deleteAction, deleting] = useToastedActionState(removeStudent, EMPTY);

  const section = sections.find((s) => String(s.id) === selected) ?? null;
  const all = useMemo(
    () => (section ? (groups.get(section.id) ?? []) : []),
    [groups, section],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .filter((r) =>
        needle === ""
          ? true
          : `${r.fullName} ${r.admissionNo} ${r.fullNameNp ?? ""}`
              .toLowerCase()
              .includes(needle),
      )
      .filter((r) => (status === "" ? true : r.status === status))
      .sort((a, b) => a.rollNo - b.rollNo);
  }, [all, query, status]);

  if (sections.length === 0) return null;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <RailNav
          ariaLabel="Sections"
          title="Sections"
          items={items}
          selected={selected}
          onSelect={(key) => {
            setSelected(key);
            setQuery("");
          }}
          hint="Pick a section to see its roll."
        />

        <section className="card-surface flex min-w-0 flex-col p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {section ? `${section.grade.name} ${section.name}` : "—"}
              </h2>
              <p className="text-muted-foreground text-sm tabular-nums">
                {all.length} student{all.length === 1 ? "" : "s"} ·{" "}
                {all.filter((r) => r.status === "ACTIVE").length} active
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FieldSelect
                aria-label="Status"
                value={status}
                onValueChange={(next) => setStatus(next ?? "")}
                className="w-auto"
                options={[
                  { value: "", label: "All students" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "LEFT", label: "Left" },
                  { value: "GRADUATED", label: "Graduated" },
                ]}
              />
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this section"
                  aria-label="Search this section"
                  className="w-48 pl-7"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="text-muted-foreground bg-rail mb-2 hidden min-w-[40rem] grid-cols-12 gap-3 rounded-lg px-4 py-2 text-[11px] font-medium tracking-wider uppercase md:grid">
              <div className="col-span-1">Roll</div>
              <div className="col-span-4">Name</div>
              <div className="col-span-2">Admission</div>
              <div className="col-span-2">Born</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            {shown.length === 0 ? (
              <p className="text-muted-foreground px-1 py-6 text-sm">
                {query || status ? "Nobody matches here." : "Nobody in this section yet."}
              </p>
            ) : (
              <ul className="min-w-[40rem] space-y-1">
                {shown.map((row) => (
                  <li
                    key={row.studentId}
                    className="bg-rail grid grid-cols-12 items-center gap-3 rounded-xl px-4 py-2"
                  >
                    <div className="col-span-1 text-sm tabular-nums">{row.rollNo}</div>
                    <div className="col-span-4 min-w-0">
                      <p className="truncate text-sm font-medium">{row.fullName}</p>
                      {row.fullNameNp ? (
                        <p className="text-muted-foreground truncate text-xs">
                          {row.fullNameNp}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-sm tabular-nums">{row.admissionNo}</div>
                    <div className="col-span-2 text-sm tabular-nums">{row.dobLabel}</div>
                    <div className="col-span-3 flex items-center justify-end gap-1">
                      <StatusPill tone={STATUS_TONE[row.status] ?? "neutral"}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </StatusPill>
                      <Button
                        render={<Link href={`/dashboard/students/${row.studentId}`} />}
                        nativeButton={false}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open ${row.fullName}'s profile`}
                        title="Open profile"
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(row)}
                        aria-label={`Edit ${row.fullName}`}
                        title="Edit"
                      >
                        <Pencil />
                      </Button>
                      <form action={deleteAction} className="contents">
                        <input type="hidden" name="studentId" value={row.studentId} />
                        <ConfirmSubmit
                          icon
                          pending={deleting}
                          title={`Delete ${row.fullName}`}
                          confirmLabel="Delete?"
                        />
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-muted-foreground mt-3 text-xs tabular-nums">
            Showing {shown.length} of {all.length}
          </p>
        </section>
      </div>

      <Modal
        open={editing !== null}
        title={editing?.fullName ?? ""}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <>
            <Link
              href={`/dashboard/students/${editing.studentId}`}
              className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
            >
              <ExternalLink className="size-3.5" />
              Open full profile
            </Link>
            {/* Keyed per student: the panel holds its own state, and opening a
                second row must not inherit the first one's. */}
            <StudentDetail
              key={editing.studentId}
              data={editing}
              sections={sections}
              academicYearId={academicYearId}
              onDone={() => setEditing(null)}
            />
          </>
        ) : null}
      </Modal>
    </>
  );
}
