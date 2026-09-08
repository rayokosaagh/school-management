"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameFields } from "@/components/ui/name-fields";
import { BsDateField } from "@/components/ui/bs-date-field";
import { FieldSelect } from "@/components/ui/select";
import {
  GENDER_OPTIONS,
  RELATION_OPTIONS,
  STUDENT_STATUS_OPTIONS,
  sectionOptions,
} from "@/lib/registry/options";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  type ActionState,
  editStudent,
  moveStudentSection,
  removeGuardian,
  removeStudent,
  saveGuardian,
} from "../actions";

const EMPTY: ActionState = {};

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  // Success is announced by a toast; only the error stays beside the field.
  return null;
}

export type StudentDetailData = {
  studentId: number;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  address: string | null;
  gender: string;
  status: string;
  dobBs: string;
  admittedOnBs: string;
  sectionId: number;
  guardians: {
    id: number;
    relation: string;
    fullName: string;
    phone: string;
    occupation: string | null;
    isPrimary: boolean;
  }[];
};

export function StudentDetail({
  data,
  sections,
  academicYearId,
  onDone,
}: {
  data: StudentDetailData;
  sections: { id: number; name: string; grade: { name: string } }[];
  academicYearId: number;
  onDone: () => void;
}) {
  const [editState, editAction, editing] = useToastedActionState(editStudent, EMPTY);
  const [moveState, moveAction, moving] = useToastedActionState(moveStudentSection, EMPTY);
  const [delState, delAction, deleting] = useToastedActionState(removeStudent, EMPTY);
  const [guardState, guardAction, savingGuardian] = useToastedActionState(saveGuardian, EMPTY);
  const [gDelState, gDelAction] = useToastedActionState(removeGuardian, EMPTY);
  const [addingGuardian, setAddingGuardian] = useState(false);

  // Changes whenever the server sends back different values for this student.
  const signature = [
    data.admissionNo,
    data.fullName,
    data.fullNameNp,
    data.address,
    data.gender,
    data.status,
    data.dobBs,
    data.admittedOnBs,
    data.middleName,
  ].join("|");

  return (
    <div className="space-y-6">
      {/* Re-keyed when the server sends new values, so saved data replaces the
          field defaults instead of silently leaving stale ones mounted. */}
      <form key={signature} action={editAction} className="space-y-4">
        <input type="hidden" name="studentId" value={data.studentId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`adm-${data.studentId}`}><TranslatedText>Admission number</TranslatedText></Label>
            <Input id={`adm-${data.studentId}`} name="admissionNo" defaultValue={data.admissionNo} required />
          </div>
          <NameFields
            idPrefix={`s${data.studentId}-`}
            firstName={data.firstName}
            middleName={data.middleName ?? ""}
            lastName={data.lastName}
            fullNameNp={data.fullNameNp ?? ""}
          />
          <div className="space-y-2">
            <Label htmlFor={`addr-${data.studentId}`}><TranslatedText>Address</TranslatedText></Label>
            <Input id={`addr-${data.studentId}`} name="address" defaultValue={data.address ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`gen-${data.studentId}`}><TranslatedText>Gender</TranslatedText></Label>
            <FieldSelect
              id={`gen-${data.studentId}`}
              name="gender"
              defaultValue={data.gender}
              options={GENDER_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`st-${data.studentId}`}><TranslatedText>Status</TranslatedText></Label>
            <FieldSelect
              id={`st-${data.studentId}`}
              name="status"
              defaultValue={data.status}
              options={STUDENT_STATUS_OPTIONS}
            />
          </div>
          <BsDateField
            id={`dob-${data.studentId}`}
            name="dob"
            label="Date of birth"
            defaultValue={data.dobBs}
            required
          />
          <BsDateField
            id={`adm-on-${data.studentId}`}
            name="admittedOn"
            label="Admitted on"
            defaultValue={data.admittedOnBs}
            required
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={editing}>
            <TranslatedText>{editing ? "Saving…" : "Save changes"}</TranslatedText>
          </Button>
          <Status state={editState} />
        </div>
      </form>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium"><TranslatedText>Move to another section</TranslatedText></p>
        <form action={moveAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="studentId" value={data.studentId} />
          <input type="hidden" name="academicYearId" value={academicYearId} />
          <FieldSelect
            name="sectionId"
            aria-label="Section"
            defaultValue={String(data.sectionId)}
            options={sectionOptions(sections)}
            className="max-w-48"
          />
          <Button type="submit" variant="outline" disabled={moving}>
            <TranslatedText>{moving ? "Moving…" : "Move"}</TranslatedText>
          </Button>
          <Status state={moveState} />
        </form>
        <p className="text-muted-foreground text-xs"><TranslatedText>
          Moving reissues the roll number from the destination section.
        </TranslatedText></p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium"><TranslatedText>Guardians</TranslatedText></p>
          <Button type="button" size="xs" variant="outline" onClick={() => setAddingGuardian((v) => !v)}>
            <TranslatedText>{addingGuardian ? "Cancel" : "Add guardian"}</TranslatedText>
          </Button>
        </div>

        {data.guardians.map((g) => (
          <form
            key={`${g.id}-${g.relation}-${g.fullName}-${g.phone}-${g.occupation ?? ""}-${g.isPrimary}`}
            action={guardAction}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-5 sm:items-end"
          >
            <input type="hidden" name="guardianId" value={g.id} />
            <div className="space-y-1">
              <Label htmlFor={`rel-${g.id}`} className="text-xs"><TranslatedText>Relation</TranslatedText></Label>
              <FieldSelect
                id={`rel-${g.id}`}
                name="relation"
                defaultValue={g.relation}
                options={RELATION_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`gn-${g.id}`} className="text-xs"><TranslatedText>Name</TranslatedText></Label>
              <Input id={`gn-${g.id}`} name="fullName" defaultValue={g.fullName} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`gp-${g.id}`} className="text-xs"><TranslatedText>Phone</TranslatedText></Label>
              <Input id={`gp-${g.id}`} name="phone" defaultValue={g.phone} inputMode="tel" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`go-${g.id}`} className="text-xs"><TranslatedText>Occupation</TranslatedText></Label>
              <Input id={`go-${g.id}`} name="occupation" defaultValue={g.occupation ?? ""} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" name="isPrimary" defaultChecked={g.isPrimary} className="size-3.5" /><TranslatedText>
                Primary
              </TranslatedText></label>
              <Button type="submit" size="xs" variant="outline" disabled={savingGuardian}><TranslatedText>
                Save
              </TranslatedText></Button>
            </div>
          </form>
        ))}

        {data.guardians.map((g) => (
          <form key={`del-${g.id}`} action={gDelAction} className="flex items-center gap-2">
            <input type="hidden" name="guardianId" value={g.id} />
            <span className="text-muted-foreground text-xs">{g.fullName}</span>
            <ConfirmSubmit label="Remove" confirmLabel="Remove?" size="xs" />
          </form>
        ))}
        <Status state={gDelState} />

        {addingGuardian ? (
          <form action={guardAction} className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-5 sm:items-end">
            <input type="hidden" name="studentId" value={data.studentId} />
            <div className="space-y-1">
              <Label htmlFor="new-rel" className="text-xs"><TranslatedText>Relation</TranslatedText></Label>
              <FieldSelect
                id="new-rel"
                name="relation"
                defaultValue="FATHER"
                options={RELATION_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-gn" className="text-xs"><TranslatedText>Name</TranslatedText></Label>
              <Input id="new-gn" name="fullName" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-gp" className="text-xs"><TranslatedText>Phone</TranslatedText></Label>
              <Input id="new-gp" name="phone" inputMode="tel" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-go" className="text-xs"><TranslatedText>Occupation</TranslatedText></Label>
              <Input id="new-go" name="occupation" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" name="isPrimary" className="size-3.5" /><TranslatedText>
                Primary
              </TranslatedText></label>
              <Button type="submit" size="xs" disabled={savingGuardian}><TranslatedText>
                Add
              </TranslatedText></Button>
            </div>
          </form>
        ) : null}
        <Status state={guardState} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <form action={delAction} className="flex items-center gap-2">
          <input type="hidden" name="studentId" value={data.studentId} />
          <ConfirmSubmit
            label="Delete student"
            confirmLabel="Delete permanently?"
            pending={deleting}
          />
        </form>
        <Button type="button" variant="ghost" onClick={onDone}><TranslatedText>
          Close
        </TranslatedText></Button>
        <Status state={delState} />
      </div>
      <p className="text-muted-foreground text-xs"><TranslatedText>
        Deleting removes guardians and enrolments too. A student who has left should
        be marked </TranslatedText><span className="font-medium"><TranslatedText>Left</TranslatedText></span><TranslatedText> instead.
      </TranslatedText></p>
    </div>
  );
}
