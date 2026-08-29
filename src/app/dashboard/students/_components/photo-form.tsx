"use client";

import { PhotoField } from "@/components/ui/photo-field";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { saveStudentPhoto, type PhotoState } from "../actions";

const EMPTY: PhotoState = {};

export function StudentPhotoForm({
  studentId,
  photoId,
  name,
}: {
  studentId: number;
  photoId: number | null;
  name: string;
}) {
  const [state, action, pending] = useToastedActionState(saveStudentPhoto, EMPTY);

  return (
    // Keyed on the stored photo so picking a new one clears the previous preview.
    <form key={photoId ?? "none"} action={action}>
      <input type="hidden" name="studentId" value={studentId} />
      <PhotoField photoId={photoId} alt={`Photo of ${name}`} size="lg" />
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save photo"}
        </Button>
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
    </form>
  );
}
