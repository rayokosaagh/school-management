"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Pencil, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldSelect } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/record-table";
import { RailNav } from "@/components/ui/rail-nav";
import { shortGrade } from "@/lib/registry/grade-label";
import type { OfferingRow } from "./subjects-view";

// One grade at a time: the rail is the index, the panel is that grade's subjects.
// Ninety offerings in one list is what made this page unreadable.

type Grade = { name: string; order: number; count: number; practical: number };

export function GradeOfferings({
  rows,
  yearName,
  renderDetail,
}: {
  rows: OfferingRow[];
  yearName: string;
  /// The edit panel, raised by the row's pencil. Owned by the parent so this
  /// component stays about layout.
  renderDetail: (row: OfferingRow) => void;
}) {
  const grades = useMemo<Grade[]>(() => {
    const byName = new Map<string, Grade>();
    for (const row of rows) {
      const existing = byName.get(row.gradeName);
      if (existing) {
        existing.count += 1;
        if (row.hasPractical) existing.practical += 1;
      } else {
        byName.set(row.gradeName, {
          name: row.gradeName,
          order: row.gradeOrder,
          count: 1,
          practical: row.hasPractical ? 1 : 0,
        });
      }
    }
    return [...byName.values()].sort((a, b) => a.order - b.order);
  }, [rows]);

  const [selected, setSelected] = useState<string | null>(grades[0]?.name ?? null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((r) => r.gradeName === selected)
      .filter((r) =>
        needle === ""
          ? true
          : `${r.subjectName} ${r.subjectCode}`.toLowerCase().includes(needle),
      )
      .filter((r) => (kind === "" ? true : kind === "practical" ? r.hasPractical : !r.hasPractical))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [rows, selected, query, kind]);

  const current = grades.find((g) => g.name === selected) ?? null;

  if (grades.length === 0) {
    return (
      <section className="card-surface p-5">
        <h2 className="font-semibold">Curriculum for {yearName}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          No grade has any subjects set up yet.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
      <RailNav
        ariaLabel="Grades"
        title="Grades"
        items={grades.map((g) => ({
          key: g.name,
          badge: shortGrade(g.name),
          label: g.name,
          count: g.count,
        }))}
        selected={selected}
        onSelect={(key) => {
          setSelected(key);
          setQuery("");
        }}
        hint="Pick a grade to see and edit the subjects it is taught."
      />

      <section className="card-surface flex min-w-0 flex-col p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="bg-action text-action-foreground grid size-9 shrink-0 place-items-center rounded-xl text-sm font-semibold"
            >
              {current ? shortGrade(current.name) : "—"}
            </span>
            <div>
              <h2 className="font-semibold">{current?.name}</h2>
              <p className="text-muted-foreground text-sm tabular-nums">
                {current?.count} subject{current?.count === 1 ? "" : "s"} ·{" "}
                {current?.practical} with practical
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FieldSelect
              aria-label="Mark scheme"
              value={kind}
              onValueChange={(next) => setKind(next ?? "")}
              className="w-auto"
              options={[
                { value: "", label: "All subjects" },
                { value: "practical", label: "Has practical" },
                { value: "theory", label: "Theory only" },
              ]}
            />
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search subjects"
                aria-label="Search subjects"
                className="w-44 pl-7"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="text-muted-foreground bg-rail mb-2 hidden min-w-[36rem] grid-cols-12 gap-3 rounded-lg px-4 py-2 text-[11px] font-medium tracking-wider uppercase md:grid">
            <div className="col-span-6">Subject</div>
            <div className="col-span-2">Theory</div>
            <div className="col-span-2">Practical</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {shown.length === 0 ? (
            <p className="text-muted-foreground px-1 py-6 text-sm">
              {query || kind
                ? "Nothing matches here."
                : `${current?.name} has no subjects yet.`}
            </p>
          ) : (
            <ul className="min-w-[36rem] space-y-1">
              {shown.map((row) => (
                <li
                  key={row.id}
                  className="bg-rail grid grid-cols-12 items-center gap-3 rounded-xl px-4 py-2"
                >
                  <div className="col-span-6 min-w-0">
                    <p className="truncate text-sm font-medium">{row.subjectName}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {row.subjectCode}
                    </p>
                  </div>
                  <div className="col-span-2 text-sm tabular-nums">
                    {row.passMarksTheory} / {row.fullMarksTheory}
                  </div>
                  <div className="col-span-2 text-sm tabular-nums">
                    {row.hasPractical ? (
                      <span className="flex items-center gap-1.5">
                        <FlaskConical
                          className="text-tint-green-fg size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {row.passMarksPractical} / {row.fullMarksPractical}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <StatusPill tone={row.assignments > 0 ? "positive" : "neutral"}>
                      {row.assignments > 0 ? "Taught" : "No teacher"}
                    </StatusPill>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => renderDetail(row)}
                      aria-label={`Edit ${row.subjectName} for ${row.gradeName}`}
                      title="Edit"
                    >
                      <Pencil />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-muted-foreground mt-3 text-xs tabular-nums">
          Showing {shown.length} of {current?.count} subject
          {current?.count === 1 ? "" : "s"} in {current?.name}
        </p>
      </section>
    </div>
  );
}
