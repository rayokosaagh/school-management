"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, addAcademicYear, addGrade, addSection } from "../actions";
import { FieldSelect } from "@/components/ui/select";

const EMPTY: ActionState = {};

// Native select rather than the Base UI one: it posts its value with the form
// action without extra wiring, and works before hydration.
function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export function AddYearForm() {
  const [state, action, pending] = useToastedActionState(addAcademicYear, EMPTY);

  return (
    <form action={action} className="space-y-2">
      <Label htmlFor="nameBS"><TranslatedText>Bikram Sambat year</TranslatedText></Label>
      <div className="flex gap-2">
        <Input id="nameBS" name="nameBS" placeholder="2082" inputMode="numeric" required />
        <Button type="submit" disabled={pending}>
          <TranslatedText>{pending ? "Adding…" : "Add"}</TranslatedText>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground"><TranslatedText>
        Baisakh 1 to the last day of Chaitra is worked out for you.
      </TranslatedText></p>
      <Status state={state} />
    </form>
  );
}

export function AddGradeForm() {
  const [state, action, pending] = useToastedActionState(addGrade, EMPTY);

  return (
    <form action={action} className="space-y-2">
      <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end">
        <div className="space-y-2">
          <Label htmlFor="grade-name"><TranslatedText>Grade</TranslatedText></Label>
          <Input id="grade-name" name="name" placeholder="Class 5" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grade-order"><TranslatedText>Order</TranslatedText></Label>
          <Input id="grade-order" name="order" placeholder="5" inputMode="numeric" required />
        </div>
        <Button type="submit" disabled={pending}>
          <TranslatedText>{pending ? "Adding…" : "Add"}</TranslatedText>
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function AddSectionForm({
  grades,
  academicYearId,
}: {
  grades: { id: number; name: string }[];
  academicYearId: number;
}) {
  const [state, action, pending] = useToastedActionState(addSection, EMPTY);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end">
        <div className="space-y-2">
          <Label htmlFor="section-grade"><TranslatedText>Grade</TranslatedText></Label>
          <FieldSelect
            id="section-grade"
            name="gradeId"
            required
            options={grades.map((g) => ({ value: String(g.id), label: g.name }))}
            defaultValue={grades[0] ? String(grades[0].id) : undefined}
            placeholder="Choose a grade"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="section-name"><TranslatedText>Section</TranslatedText></Label>
          <Input id="section-name" name="name" placeholder="A" maxLength={4} required />
        </div>
        <Button type="submit" disabled={pending}>
          <TranslatedText>{pending ? "Adding…" : "Add"}</TranslatedText>
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

