"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useToastedActionState } from "@/components/ui/toast";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameFields } from "@/components/ui/name-fields";
import { BsDateField } from "@/components/ui/bs-date-field";
import { FieldSelect } from "@/components/ui/select";
import {
  GENDER_OPTIONS,
  RELATION_OPTIONS,
  sectionOptions,
} from "@/lib/registry/options";
import { type ActionState, addStudent } from "../actions";

const EMPTY: ActionState = {};

export function AddStudentForm({
  sections,
  academicYearId,
  suggestedAdmissionNo,
}: {
  sections: { id: number; name: string; grade: { name: string } }[];
  academicYearId: number;
  suggestedAdmissionNo: string;
}) {
  const [state, action, pending] = useToastedActionState(addStudent, EMPTY);

  return (
    // Admitting a student revalidates the page, which sends down a fresh
    // suggested admission number. Keying on it remounts the fields with the new
    // defaults instead of mutating an already-initialised uncontrolled input,
    // and clears the form ready for the next admission.
    <form key={suggestedAdmissionNo} action={action} className="space-y-5">
      <input type="hidden" name="academicYearId" value={academicYearId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="admissionNo"><TranslatedText>Admission number</TranslatedText></Label>
          <Input
            id="admissionNo"
            name="admissionNo"
            defaultValue={suggestedAdmissionNo}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sectionId"><TranslatedText>Section</TranslatedText></Label>
          <FieldSelect
            id="sectionId"
            name="sectionId"
            required
            options={sectionOptions(sections)}
            defaultValue={sections[0] ? String(sections[0].id) : undefined}
            placeholder="Choose a section"
          />
        </div>
        <NameFields idPrefix="student-" />
        <div className="space-y-2">
          <Label htmlFor="gender"><TranslatedText>Gender</TranslatedText></Label>
          <FieldSelect
            id="gender"
            name="gender"
            required
            options={GENDER_OPTIONS}
            defaultValue="MALE"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address"><TranslatedText>Address</TranslatedText></Label>
          <Input id="address" name="address" placeholder="Address" />
        </div>
        <BsDateField id="dob" name="dob" label="Date of birth" required />
        <BsDateField id="admittedOn" name="admittedOn" label="Admitted on" required />
      </div>

      <div className="space-y-4 border-t pt-4">
        <p className="text-sm font-medium"><TranslatedText>Primary guardian</TranslatedText></p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="guardianRelation"><TranslatedText>Relation</TranslatedText></Label>
            <FieldSelect
              id="guardianRelation"
              name="guardianRelation"
              required
              options={RELATION_OPTIONS}
              defaultValue="FATHER"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianName"><TranslatedText>Name</TranslatedText></Label>
            <Input
              id="guardianName"
              name="guardianName"
              placeholder="Guardian full name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianPhone"><TranslatedText>Phone</TranslatedText></Label>
            <Input
              id="guardianPhone"
              name="guardianPhone"
              placeholder="Mobile number"
              inputMode="tel"
              required
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs"><TranslatedText>
          This number is where absence and fee messages will go later.
        </TranslatedText></p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="action" size="xl" disabled={pending}>
          <PlusCircle />
          <TranslatedText>{pending ? "Admitting…" : "Admit student"}</TranslatedText>
        </Button>
        {state.error ? (
          <p className="text-destructive text-sm">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="text-muted-foreground text-sm">{state.success}</p>
        ) : null}
      </div>
    </form>
  );
}
