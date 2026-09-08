"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonName, personLabel, personSearch } from "@/components/ui/person-name";
import { clampPageIndex } from "@/lib/table/paging";
import { cn } from "@/lib/utils";

export type StudentChoice = { id: number; name: string; nameNp: string | null; admissionNo: string; section: string };

export function StudentPicker({ students, selectedIds, onSelectionChange, multiple = false, disabled = false }: {
  students: StudentChoice[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [page, setPage] = useState(0);
  const query = search.trim().toLocaleLowerCase();
  const sections = [...new Set(students.map(student => student.section))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const filtered = students.filter(student =>
    (section === "" || student.section === section) &&
    (query === "" || `${personSearch(student.name, student.nameNp)} ${student.admissionNo}`.toLocaleLowerCase().includes(query)),
  );
  const pageSize = 10;
  const safePage = clampPageIndex(page, filtered.length, pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const selected = new Set(selectedIds);

  function choose(studentId: number) {
    if (disabled) return;
    onSelectionChange(multiple
      ? selected.has(studentId) ? selectedIds.filter(value => value !== studentId) : [...selectedIds, studentId]
      : [studentId]);
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-2">
          <Label htmlFor={`${id}-search`}><TranslatedText>Find a student</TranslatedText></Label>
          <div className="relative">
            <Search className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
            <Input id={`${id}-search`} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Name or admission number" disabled={disabled} className="pl-9" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-section`}><TranslatedText>Class / section</TranslatedText></Label>
          <FieldSelect id={`${id}-section`} value={section} onValueChange={value => { setSection(value ?? ""); setPage(0); }} options={[{ value: "", label: "All classes / sections" }, ...sections.map(label => ({ value: label, label }))]} disabled={disabled} className="w-full" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink-3 text-xs" role="status">{selectedIds.length}<TranslatedText> selected · </TranslatedText>{filtered.length}<TranslatedText> matching student</TranslatedText><TranslatedText>{filtered.length === 1 ? "" : "s"}</TranslatedText></p>
        {selectedIds.length > 0 ? <Button type="button" variant="ghost" size="xs" onClick={() => onSelectionChange([])} disabled={disabled}><TranslatedText>Clear selection</TranslatedText></Button> : null}
      </div>
      <div className="border-line overflow-hidden rounded-xl border">
        <Table>
          <caption className="sr-only"><TranslatedText>{multiple ? "Select students" : "Choose one student"}</TranslatedText><TranslatedText>. Search and class filters keep existing selections.</TranslatedText></caption>
          <TableHeader className="bg-surface-2">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="w-12 px-4"><span className="sr-only"><TranslatedText>Select</TranslatedText></span></TableHead>
              <TableHead scope="col" className="text-ink-3 text-xs"><TranslatedText>Student</TranslatedText></TableHead>
              <TableHead scope="col" className="text-ink-3 pr-4 text-xs"><TranslatedText>Class / section</TranslatedText></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(student => (
              <TableRow key={student.id} data-state={selected.has(student.id) ? "selected" : undefined} onClick={() => choose(student.id)} className={cn("border-line", selected.has(student.id) && "bg-brand-tint hover:bg-brand-tint", disabled ? "opacity-60" : "cursor-pointer")}>
                <TableCell className="px-4 py-3">
                  <input type={multiple ? "checkbox" : "radio"} name={`${id}-selection`} value={student.id} checked={selected.has(student.id)} onChange={() => choose(student.id)} onClick={event => event.stopPropagation()} disabled={disabled} aria-label={`Select ${personLabel(student.name, student.nameNp)}, ${student.admissionNo}, ${student.section}`} className="accent-brand focus-visible:ring-brand size-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none" />
                </TableCell>
                <TableCell className="max-w-72 py-3 whitespace-normal"><PersonName en={student.name} np={student.nameNp} className="text-sm" /><p className="text-ink-3 mt-1 break-words text-xs">{student.admissionNo}</p></TableCell>
                <TableCell className="text-ink-2 py-3 pr-4 text-xs whitespace-normal">{student.section}</TableCell>
              </TableRow>
            ))}
            {visible.length === 0 ? <TableRow><TableCell colSpan={3} className="px-4 py-9 text-center whitespace-normal"><Users className="text-brand mx-auto mb-3 size-6" aria-hidden="true" /><p className="text-sm font-medium"><TranslatedText>{students.length ? "No students match" : "No students available"}</TranslatedText></p><p className="text-ink-3 mt-2 text-xs leading-5"><TranslatedText>{students.length ? "Try another name, admission number, or class." : "Add active students to this academic year first."}</TranslatedText></p>{students.length ? <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => { setSearch(""); setSection(""); setPage(0); }} disabled={disabled}><TranslatedText>Clear filters</TranslatedText></Button> : null}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        <div className="border-line text-ink-3 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
          <span><TranslatedText>Showing </TranslatedText>{filtered.length === 0 ? 0 : safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)}<TranslatedText> of </TranslatedText>{filtered.length}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous students page" disabled={disabled || safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
            <span className="tabular-nums">{safePage + 1} / {pageCount}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Next students page" disabled={disabled || safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}><ChevronRight className="size-4" aria-hidden="true" /></Button>
          </div>
        </div>
      </div>
      {multiple ? <p className="text-ink-3 text-xs leading-5"><TranslatedText>Selections are kept when you search, change class, or move between pages.</TranslatedText></p> : null}
    </div>
  );
}
