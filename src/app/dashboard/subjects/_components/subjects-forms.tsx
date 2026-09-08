"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, addOffering, addSubject } from "../actions";
import { FieldSelect } from "@/components/ui/select";

const EMPTY: ActionState = {};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export function AddSubjectForm() {
  const [state, action, pending] = useToastedActionState(addSubject, EMPTY);

  return (
    <form action={action} className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="space-y-2">
          <Label htmlFor="subject-name"><TranslatedText>Subject</TranslatedText></Label>
          <Input id="subject-name" name="name" placeholder="Compulsory Maths" required />
        </div>
        <Button type="submit" disabled={pending}>
          <TranslatedText>{pending ? "Adding…" : "Add"}</TranslatedText>
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function AddOfferingForm({
  subjects,
  grades,
  academicYearId,
}: {
  subjects: { id: number; name: string }[];
  grades: { id: number; name: string }[];
  academicYearId: number;
}) {
  const [state, action, pending] = useToastedActionState(addOffering, EMPTY);
  const [hasPractical, setHasPractical] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="academicYearId" value={academicYearId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="offering-subject"><TranslatedText>Subject</TranslatedText></Label>
          <FieldSelect
            id="offering-subject"
            name="subjectId"
            required
            options={subjects.map((s) => ({
              value: String(s.id),
              label: s.name,
            }))}
            defaultValue={subjects[0] ? String(subjects[0].id) : undefined}
            placeholder="Choose a subject"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="offering-grade"><TranslatedText>Grade</TranslatedText></Label>
          <FieldSelect
            id="offering-grade"
            name="gradeId"
            required
            options={grades.map((g) => ({ value: String(g.id), label: g.name }))}
            defaultValue={grades[0] ? String(grades[0].id) : undefined}
            placeholder="Choose a grade"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullMarksTheory"><TranslatedText>Theory full marks</TranslatedText></Label>
          <Input
            id="fullMarksTheory"
            name="fullMarksTheory"
            defaultValue="75"
            inputMode="numeric"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="passMarksTheory"><TranslatedText>Theory pass marks</TranslatedText></Label>
          <Input
            id="passMarksTheory"
            name="passMarksTheory"
            defaultValue="27"
            inputMode="numeric"
            required
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="hasPractical"
          checked={hasPractical}
          onChange={(e) => setHasPractical(e.target.checked)}
          className="border-input size-4 rounded border"
        /><TranslatedText>
        This subject has a practical
      </TranslatedText></label>

      {hasPractical ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullMarksPractical"><TranslatedText>Practical full marks</TranslatedText></Label>
            <Input
              id="fullMarksPractical"
              name="fullMarksPractical"
              defaultValue="25"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passMarksPractical"><TranslatedText>Practical pass marks</TranslatedText></Label>
            <Input
              id="passMarksPractical"
              name="passMarksPractical"
              defaultValue="10"
              inputMode="numeric"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="action" size="xl" disabled={pending}>
          <PlusCircle />
          <TranslatedText>{pending ? "Adding…" : "Add offering"}</TranslatedText>
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

