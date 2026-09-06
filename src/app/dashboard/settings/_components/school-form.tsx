"use client";

import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoField } from "@/components/ui/photo-field";
import { type SchoolState, updateSchool } from "../actions";

const EMPTY: SchoolState = {};

export function SchoolForm({
  school,
}: {
  school: {
    name: string;
    nameNp: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logo: { id: number } | null;
  } | null;
}) {
  const [state, action, pending] = useToastedActionState(updateSchool, EMPTY);

  // No encType here: when `action` is a function, React posts the form itself
  // and sets multipart automatically. Declaring it is overridden and warns;
  // the file input still uploads.
  return (
    <form key={school?.logo?.id ?? "none"} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="school-name">School name</Label>
          <Input
            id="school-name"
            name="name"
            defaultValue={school?.name ?? ""}
            placeholder="School name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-nameNp">
            Name in Nepali{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="school-nameNp"
            name="nameNp"
            defaultValue={school?.nameNp ?? ""}
            placeholder="Name in Devanagari"
            lang="ne"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-address">Address</Label>
          <Input
            id="school-address"
            name="address"
            defaultValue={school?.address ?? ""}
            placeholder="Address"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-phone">Phone</Label>
          <Input
            id="school-phone"
            name="phone"
            defaultValue={school?.phone ?? ""}
            placeholder="Phone number"
            inputMode="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-email">Email</Label>
          <Input
            id="school-email"
            name="email"
            defaultValue={school?.email ?? ""}
            placeholder="Email address"
            type="email"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>School logo</Label>
        <PhotoField
          name="logo"
          removeName="removeLogo"
          photoId={school?.logo?.id ?? null}
          alt={school?.name ? `${school.name} logo` : "School logo"}
          size="lg"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save school details"}
        </Button>
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
      <p className="text-muted-foreground text-xs">
        These appear in the dashboard header and on the letterhead of every
        printed marksheet. The logo also appears on the sign-in page.
      </p>
    </form>
  );
}
