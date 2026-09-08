"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

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

type Filter = "all" | "assigned" | "empty" | "former";

/// Who belongs in a workload view.
///
/// Designation alone will not do: the Principal and the Vice Principal both
/// carry classes here, so filtering on the word "Teacher" would hide real
/// load. Anyone holding a class is teaching staff whatever their title says;
/// beyond that, the title is what is left to go on. The accountant, who holds
/// nothing and is not a teacher, is not part of the teaching workload.
function isTeachingStaff(person: { designation: string; assignments: unknown[] }) {
  return person.assignments.length > 0 || /teacher/i.test(person.designation);
}

export function TeacherLoadView({ rows, staff, chosen, onManage }: {
  rows: TeachingRow[];
  staff: LoadStaff[];
  chosen: Record<string, string>;
  onManage: (teacherId: string, sectionId?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("most");
  const { people: everyone, unassigned } = useMemo(() => summarizeLoad(rows, staff, chosen), [rows, staff, chosen]);
  const people = useMemo(() => everyone.filter(isTeachingStaff), [everyone]);
  const assignedPeople = people.filter((person) => person.assignments.length > 0).length;
  const maxLoad = Math.max(1, ...people.map((person) => person.assignments.length));
  const assignedSlots = rows.length - unassigned;
  const coverage = rows.length ? Math.round(assignedSlots / rows.length * 100) : 0;
  const q = query.trim().toLowerCase();
  const formerHolders = people.filter((person) => !person.isActive && person.assignments.length > 0);
  const formerSlots = formerHolders.reduce((sum, person) => sum + person.assignments.length, 0);
  const visible = people.filter((person) => {
    if (filter === "assigned" && !person.assignments.length) return false;
    if (filter === "empty" && person.assignments.length) return false;
    if (filter === "former" && person.isActive) return false;
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

      {formerHolders.length > 0 ? (
        <div className="border-warn/25 bg-warn/5 mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-ink-2 text-sm">
            <span className="text-warn font-semibold">
              {formerSlots}<TranslatedText> class</TranslatedText><TranslatedText>{formerSlots === 1 ? "" : "es"}</TranslatedText>
            </span><TranslatedText>{" "}</TranslatedText>
            <TranslatedText>{formerSlots === 1 ? "is" : "are"}</TranslatedText><TranslatedText> still assigned to</TranslatedText><TranslatedText>{" "}</TranslatedText>
            {formerHolders.length === 1 ? formerHolders[0].fullName : `${formerHolders.length} deactivated staff`}.
          </p>
          <Button size="sm" variant="outline" onClick={() => setFilter("former")}><TranslatedText>
            Show </TranslatedText><TranslatedText>{formerHolders.length === 1 ? "card" : "cards"}</TranslatedText> <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {unassigned > 0 ? (
        <div className="border-warn/25 bg-warn/5 mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-ink-2 text-sm"><span className="text-warn font-semibold">{unassigned}<TranslatedText> unassigned slot</TranslatedText><TranslatedText>{unassigned === 1 ? "" : "s"}</TranslatedText></span><TranslatedText> still need a teacher.</TranslatedText></p>
          <Button size="sm" variant="outline" onClick={() => onManage("unassigned")}><TranslatedText>Review slots </TranslatedText><ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
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
            ...(formerHolders.length ? [{ value: "former" as const, label: "Deactivated", count: formerHolders.length }] : []),
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
          <p className="text-sm font-medium"><TranslatedText>Workload overview </TranslatedText><span className="text-ink-3 font-normal">· {visible.length}<TranslatedText> staff shown</TranslatedText></span></p>
          <p className="text-ink-3 text-xs"><TranslatedText>One assignment = one subject in one class. Counts are not weekly periods.</TranslatedText></p>
        </div>
        {visible.length ? (
          <ul className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {visible.map((person) => <TeacherCard key={person.id} person={person} maxLoad={maxLoad} onManage={onManage} />)}
          </ul>
        ) : (
          <div className="text-ink-3 py-12 text-center">
            <Users className="mx-auto mb-3 size-6" aria-hidden="true" />
            <p className="text-ink text-sm font-medium"><TranslatedText>{people.length ? "No staff match this view" : "No active staff yet"}</TranslatedText></p>
            <p className="mt-1 text-xs"><TranslatedText>{people.length ? "Try a different search or assignment filter." : "Add staff on the Teachers page to start assigning subjects."}</TranslatedText></p>
            {people.length ? <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setQuery(""); setFilter("all"); }}><TranslatedText>Clear filters</TranslatedText></Button> : null}
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
    <li
      className={cn(
        "border-line bg-surface overflow-hidden rounded-[10px] border transition-colors hover:border-line-strong",
        !person.isActive && count > 0 && "border-warn/40",
      )}
    >
      {!person.isActive && count > 0 ? (
        <p className="bg-warn/5 text-warn border-warn/25 border-b px-4 py-1.5 text-[11px] font-medium"><TranslatedText>
          Deactivated, still holding </TranslatedText>{count}<TranslatedText> class</TranslatedText><TranslatedText>{count === 1 ? "" : "es"}</TranslatedText>
        </p>
      ) : null}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <StudentAvatar
            photoId={person.photoId}
            name={person.fullName}
            className={cn("size-10 rounded-lg bg-none text-xs font-semibold", count ? "bg-brand-tint text-brand-text" : "bg-surface-2 text-ink-3")}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{person.fullName}</h2>
            <p className="text-ink-3 mt-0.5 truncate text-xs">
              {person.designation}
              {count ? ` · ${person.subjects.length} subject${person.subjects.length === 1 ? "" : "s"} · ${person.classCount} class${person.classCount === 1 ? "" : "es"}` : null}
            </p>
          </div>
          <div className="text-right"><p className="font-display text-2xl font-semibold tabular-nums">{count}</p><p className="text-ink-3 text-[10px]"><TranslatedText>assignments</TranslatedText></p></div>
        </div>
        <div className="bg-surface-2 mt-4 flex h-2 gap-px overflow-hidden rounded-full" role="img" aria-label={`${count} assignments; largest staff load is ${maxLoad}.`}>
          {person.subjects.map((subject) => <span key={subject.name} style={{ width: `${subject.rows.length / maxLoad * 100}%`, background: `var(--subject-${subject.tone})` }} title={`${subject.name}: ${subject.rows.length} assignments`} />)}
        </div>
        {count ? (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            {person.subjects.map((subject) => <li key={subject.name} className="text-ink-2 inline-flex items-center gap-1.5 text-xs"><span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--subject-${subject.tone})` }} aria-hidden="true" />{subject.name}<span className="text-ink-3 font-mono text-[10px]">{subject.rows.length}</span></li>)}
          </ul>
        ) : <p className="text-ink-3 mt-3 text-xs"><TranslatedText>No teaching assignments for this academic year.</TranslatedText></p>}
      </div>
      {count ? (
        <details className="border-line group border-t">
          <summary className="text-ink-2 hover:bg-surface-2 focus-visible:ring-brand flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <BookOpen className="size-3.5" aria-hidden="true" /><TranslatedText> Classes & subjects </TranslatedText><ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
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
          <TranslatedText>{count ? "Manage assignments" : "Find unassigned slots"}</TranslatedText><ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
