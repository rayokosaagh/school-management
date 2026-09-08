"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteYearDialog } from "./delete-year-dialog";

type Year = { id: number; nameBS: string; span: string; isCurrent: boolean };

export function YearDeletion({ years }: { years: Year[] }) {
  const [selected, setSelected] = useState<Year | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-ink-2 text-sm"><TranslatedText>
        Review the affected records before deleting a year. The confirmation offers a restore
        point, enabled by default. Financial records may block deletion. Deleting a rollover
        year does not automatically reset students marked graduated or left.
      </TranslatedText></p>
      <Table>
        <TableHeader><TableRow><TableHead><TranslatedText>Academic year</TranslatedText></TableHead><TableHead><TranslatedText>Date range</TranslatedText></TableHead><TableHead className="text-right"><TranslatedText>Action</TranslatedText></TableHead></TableRow></TableHeader>
        <TableBody>
          {years.map((year) => <TableRow key={year.id}>
            <TableCell className="font-medium">{year.nameBS}<TranslatedText>{year.isCurrent ? " · Current" : ""}</TranslatedText></TableCell>
            <TableCell>{year.span}</TableCell>
            <TableCell className="text-right">
              <Button variant="destructive" disabled={year.isCurrent} onClick={() => setSelected(year)}
                aria-label={`Review deletion of academic year ${year.nameBS}`}><TranslatedText>
                Review deletion
              </TranslatedText></Button>
            </TableCell>
          </TableRow>)}
          {years.length === 0 ? <TableRow><TableCell colSpan={3}><TranslatedText>No academic years to delete.</TranslatedText></TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <p className="text-ink-3 text-xs"><TranslatedText>The current year cannot be deleted. Activate another year first.</TranslatedText></p>
      {selected ? <DeleteYearDialog key={selected.id} year={selected} open
        onClose={() => setSelected(null)} onDeleted={() => setSelected(null)} /> : null}
    </div>
  );
}
