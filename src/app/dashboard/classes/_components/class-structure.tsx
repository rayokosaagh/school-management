"use client";

import { startTransition, useMemo, useState } from "react";
import { Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RailNav, type RailItem } from "@/components/ui/rail-nav";
import { Modal } from "@/components/ui/modal";
import { Callout } from "@/components/ui/page-shell";
import { Info } from "lucide-react";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { assignClassTeacher } from "@/app/dashboard/teachers/actions";
import { shortGrade } from "@/lib/registry/grade-label";
import {
  GradeDetail,
  SectionDetail,
  type GradeRow,
  type SectionRow,
} from "./classes-view";

// Grades and their sections were two tables saying the same thing twice: every
// section row repeated its grade, and every grade row counted its sections.
// One rail, one panel.

export function ClassStructure({
  grades,
  sections,
  staff,
  yearName,
}: {
  grades: GradeRow[];
  sections: SectionRow[];
  staff: { id: number; fullName: string }[];
  yearName: string;
}) {
  const byGrade = useMemo(() => {
    const map = new Map<number, SectionRow[]>();
    for (const section of sections) {
      const list = map.get(section.gradeId) ?? [];
      list.push(section);
      map.set(section.gradeId, list);
    }
    return map;
  }, [sections]);

  const ordered = useMemo(
    () => [...grades].sort((a, b) => a.order - b.order),
    [grades],
  );

  const items: RailItem[] = ordered.map((grade) => ({
    key: String(grade.id),
    badge: shortGrade(grade.name),
    label: grade.name,
    count: grade.sectionCount,
  }));

  const [selected, setSelected] = useState<string | null>(items[0]?.key ?? null);
  const [, assignAction] = useToastedActionState(assignClassTeacher, {});
  // Controlled, so revalidation feeding a new teacher down does not fight an
  // uncontrolled select's initial value.
  const [chosen, setChosen] = useState<Record<number, string>>({});

  const teacherOptions = [
    { value: "", label: "No class teacher" },
    ...staff.map((s) => ({ value: String(s.id), label: s.fullName })),
  ];

  // Saved on change: the teacher belongs to the section, so it is set here
  // rather than on another page.
  function assign(sectionId: number, next: string | null) {
    setChosen((prev) => ({ ...prev, [sectionId]: next ?? "" }));
    const data = new FormData();
    data.set("sectionId", String(sectionId));
    data.set("classTeacherId", next ?? "");
    startTransition(() => assignAction(data));
  }
  const [editingGrade, setEditingGrade] = useState<GradeRow | null>(null);
  const [editingSection, setEditingSection] = useState<SectionRow | null>(null);

  const grade = ordered.find((g) => String(g.id) === selected) ?? null;
  const rows = grade ? (byGrade.get(grade.id) ?? []) : [];

  if (ordered.length === 0) {
    return (
      <Callout icon={Info} tint="amber">
        Add a grade above to start building the class structure.
      </Callout>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <RailNav
          ariaLabel="Grades"
          title="Grades"
          items={items}
          selected={selected}
          onSelect={setSelected}
          hint="The number is how many sections the grade runs."
        />

        <section className="card-surface flex min-w-0 flex-col p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-action text-action-foreground grid size-9 shrink-0 place-items-center rounded-xl text-sm font-semibold"
              >
                {grade ? shortGrade(grade.name) : "—"}
              </span>
              <div>
                <h2 className="font-semibold">{grade?.name}</h2>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {grade?.sectionCount} section{grade?.sectionCount === 1 ? "" : "s"} ·{" "}
                  {grade?.studentCount} student{grade?.studentCount === 1 ? "" : "s"} in{" "}
                  {yearName}
                </p>
              </div>
            </div>

            {grade ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingGrade(grade)}
              >
                <Pencil />
                Edit grade
              </Button>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="text-muted-foreground bg-rail mb-2 hidden min-w-[32rem] grid-cols-12 gap-3 rounded-lg px-4 py-2 text-[11px] font-medium tracking-wider uppercase md:grid">
              <div className="col-span-3">Section</div>
              <div className="col-span-5">Class teacher</div>
              <div className="col-span-2">Students</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {rows.length === 0 ? (
              <p className="text-muted-foreground px-1 py-6 text-sm">
                {grade?.name} has no sections in {yearName} yet.
              </p>
            ) : (
              <ul className="min-w-[32rem] space-y-1">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="bg-rail grid grid-cols-12 items-center gap-3 rounded-xl px-4 py-2"
                  >
                    <div className="col-span-3 text-sm font-medium">
                      {row.gradeName} {row.name}
                    </div>
                    <div className="col-span-5 min-w-0">
                      <FieldSelect
                        value={
                          chosen[row.id] ??
                          (row.classTeacherId ? String(row.classTeacherId) : "")
                        }
                        onValueChange={(next) => assign(row.id, next)}
                        aria-label={`Class teacher for ${row.gradeName} ${row.name}`}
                        className="h-8 w-full rounded-lg"
                        options={teacherOptions}
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 text-sm tabular-nums">
                      <Users
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {row.students}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditingSection(row)}
                        aria-label={`Edit ${row.gradeName} ${row.name}`}
                        title="Edit section"
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={editingGrade !== null}
        title={editingGrade?.name ?? ""}
        onClose={() => setEditingGrade(null)}
      >
        {editingGrade ? (
          <GradeDetail
            key={editingGrade.id}
            row={editingGrade}
            onDone={() => setEditingGrade(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={editingSection !== null}
        title={
          editingSection ? `${editingSection.gradeName} ${editingSection.name}` : ""
        }
        onClose={() => setEditingSection(null)}
      >
        {editingSection ? (
          <SectionDetail
            key={editingSection.id}
            row={editingSection}
            onDone={() => setEditingSection(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}
