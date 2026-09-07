"use client";

import { ArrowRight, BookOpen, ChevronDown, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kpi } from "@/components/ui/kpi";
import { FieldSelect } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { StudentAvatar } from "@/components/ui/student-avatar";
import { cn } from "@/lib/utils";
import { summarizeLoad, type LoadStaff, type TeacherLoad } from "./load-summary";
import type { TeachingRow } from "./teaching-workspace";

type Filter = "all" | "assigned" | "empty";

export function TeacherLoadView({ rows, staff, chosen, onManage }: {
  rows: TeachingRow[];
  staff: LoadStaff[];
  chosen: Record<string, string>;
  onManage: (teacherId: string, sectionId?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("most");
  const { people, unassigned } = useMemo(() => summarizeLoad(rows, staff, chosen), [rows, staff, chosen]);
  const assignedPeople = people.filter((person) => person.assignments.length > 0).length;
  const maxLoad = Math.max(1, ...people.map((person) => person.assignments.length));
  const assignedSlots = rows.length - unassigned;
  const coverage = rows.length ? Math.round(assignedSlots / rows.length * 100) : 0;
  const q = query.trim().toLowerCase();
  const visible = people.filter((person) => {
    if (filter === "assigned" && !person.assignments.length) return false;
    if (filter === "empty" && person.assignments.length) return false;
    return !q || `${person.fullName} ${person.assignments.map((row) => `${row.subjectName} ${row.sectionLabel}`).join(" ")}`.toLowerCase().includes(q);
  }).sort((a, b) => (
    sort === "name" ? 0 : sort === "least" ? a.assignments.length - b.assignments.length : b.assignments.length - a.assignments.length
  ) || a.fullName.localeCompare(b.fullName));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi value={`${assignedSlots}/${rows.length}`} label="Slots assigned" hint={`${coverage}% of class-subject slots covered`} className="shadow-[inset_3px_0_0_var(--brand)]" />
        <Kpi value={assignedPeople} label="Staff with assignments" hint={`${people.length} active staff in total`} />
        <Kpi value={assignedPeople ? (people.reduce((sum, person) => sum + person.assignments.length, 0) / assignedPeople).toFixed(1) : "—"} label="Average assignments" hint="Per staff member with assignments" />
        <Kpi value={people.length - assignedPeople} label="No assignments" hint="Active staff without teaching assignments" />
      </div>

      {unassigned > 0 ? (
        <div className="border-warn/25 bg-warn/5 mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-ink-2 text-sm"><span className="text-warn font-semibold">{unassigned} unassigned slot{unassigned === 1 ? "" : "s"}</span> still need a teacher.</p>
          <Button size="sm" variant="outline" onClick={() => onManage("unassigned")}>Review slots <ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
        </div>
      ) : null}

      <div className="border-line bg-surface flex flex-wrap items-center gap-2 border-y px-4 py-3">
        <label className="border-line text-ink-3 flex h-8 min-w-0 flex-1 basis-60 items-center gap-2 rounded-lg border px-2.5 sm:max-w-sm">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find staff, subject or class" aria-label="Search teacher load" className="h-7 min-w-0 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </label>
        <div className="max-w-full overflow-x-auto">
          <Segmented value={filter} onChange={setFilter} ariaLabel="Teaching assignment filter" options={[
            { value: "all", label: "All staff", count: people.length },
            { value: "assigned", label: "Assigned", count: assignedPeople },
            { value: "empty", label: "Unassigned", count: people.length - assignedPeople },
          ]} />
        </div>
        <FieldSelect value={sort} onValueChange={(value) => setSort(value ?? "most")} aria-label="Sort teacher load" className="h-8 w-40 sm:ml-auto" options={[
          { value: "most", label: "Most assignments" },
          { value: "least", label: "Fewest assignments" },
          { value: "name", label: "Name A–Z" },
        ]} />
      </div>

      <div className="p-4">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-1">
          <p className="text-sm font-medium">Workload overview <span className="text-ink-3 font-normal">· {visible.length} staff shown</span></p>
          <p className="text-ink-3 text-xs">One assignment = one subject in one class. Counts are not weekly periods.</p>
        </div>
        {visible.length ? (
          <ul className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {visible.map((person) => <TeacherCard key={person.id} person={person} maxLoad={maxLoad} onManage={onManage} />)}
          </ul>
        ) : (
          <div className="text-ink-3 py-12 text-center">
            <Users className="mx-auto mb-3 size-6" aria-hidden="true" />
            <p className="text-ink text-sm font-medium">{people.length ? "No staff match this view" : "No active staff yet"}</p>
            <p className="mt-1 text-xs">{people.length ? "Try a different search or assignment filter." : "Add staff on the Teachers page to start assigning subjects."}</p>
            {people.length ? <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function TeacherCard({ person, maxLoad, onManage }: {
  person: TeacherLoad;
  maxLoad: number;
  onManage: (teacherId: string, sectionId?: number) => void;
}) {
  const count = person.assignments.length;
  return (
    <li className="border-line bg-surface overflow-hidden rounded-[10px] border transition-colors hover:border-line-strong">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <StudentAvatar
            photoId={person.photoId}
            name={person.fullName}
            className={cn("size-10 rounded-lg bg-none text-xs font-semibold", count ? "bg-brand-tint text-brand-text" : "bg-surface-2 text-ink-3")}
          />
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{person.fullName}</h2><p className="text-ink-3 mt-0.5 text-xs">{person.subjects.length} subject{person.subjects.length === 1 ? "" : "s"} · {person.classCount} class{person.classCount === 1 ? "" : "es"}</p></div>
          <div className="text-right"><p className="font-display text-2xl font-semibold tabular-nums">{count}</p><p className="text-ink-3 text-[10px]">assignments</p></div>
        </div>
        <div className="bg-surface-2 mt-4 flex h-2 gap-px overflow-hidden rounded-full" role="img" aria-label={`${count} assignments; largest staff load is ${maxLoad}.`}>
          {person.subjects.map((subject) => <span key={subject.name} style={{ width: `${subject.rows.length / maxLoad * 100}%`, background: `var(--subject-${subject.tone})` }} title={`${subject.name}: ${subject.rows.length} assignments`} />)}
        </div>
        {count ? (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            {person.subjects.map((subject) => <li key={subject.name} className="text-ink-2 inline-flex items-center gap-1.5 text-xs"><span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--subject-${subject.tone})` }} aria-hidden="true" />{subject.name}<span className="text-ink-3 font-mono text-[10px]">{subject.rows.length}</span></li>)}
          </ul>
        ) : <p className="text-ink-3 mt-3 text-xs">No teaching assignments for this academic year.</p>}
      </div>
      {count ? (
        <details className="border-line group border-t">
          <summary className="text-ink-2 hover:bg-surface-2 focus-visible:ring-brand flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <BookOpen className="size-3.5" aria-hidden="true" /> Classes & subjects <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 px-4 pt-1 pb-4">
            {person.subjects.map((subject) => (
              <div key={subject.name}>
                <p className="mb-1.5 text-xs font-medium">{subject.name}</p>
                <div className="flex flex-wrap gap-1.5">{subject.rows.map((row) => <button type="button" key={`${row.sectionId}:${row.offeringId}`} onClick={() => onManage(String(person.id), row.sectionId)} className="border-line bg-surface-2 text-ink-2 hover:bg-brand-tint hover:text-brand-text focus-visible:ring-brand rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none" aria-label={`Manage ${subject.name} in ${row.sectionLabel} for ${person.fullName}`}>{row.sectionLabel}</button>)}</div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div className="border-line flex justify-end border-t px-3 py-2">
        <Button size="sm" variant="ghost" onClick={() => onManage(count ? String(person.id) : "unassigned")} aria-label={count ? `Manage assignments for ${person.fullName}` : `Find unassigned slots for ${person.fullName}`}>
          {count ? "Manage assignments" : "Find unassigned slots"}<ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
