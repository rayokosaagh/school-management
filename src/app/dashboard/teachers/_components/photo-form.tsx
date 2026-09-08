"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { PhotoField } from "@/components/ui/photo-field";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { type PhotoState, saveStaffPhoto } from "../actions";

const EMPTY: PhotoState = {};

export function StaffPhotoForm({
  staffId,
  photoId,
  name,
}: {
  staffId: number;
  photoId: number | null;
  name: string;
}) {
  const [state, action, pending] = useToastedActionState(saveStaffPhoto, EMPTY);

  return (
    // Keyed on the stored photo so picking a new one clears the previous preview.
    <form key={photoId ?? "none"} action={action}>
      <input type="hidden" name="staffId" value={staffId} />
      <PhotoField photoId={photoId} alt={`Photo of ${name}`} size="lg" />
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          <TranslatedText>{pending ? "Saving…" : "Save photo"}</TranslatedText>
        </Button>
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
    </form>
  );
}
