"use client";

import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoField } from "@/components/ui/photo-field";
import { FieldSelect } from "@/components/ui/select";
import { TranslatedText } from "@/components/i18n/language-provider";
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
    language: string;
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
          <Label htmlFor="school-name"><TranslatedText>School name</TranslatedText></Label>
          <Input
            id="school-name"
            name="name"
            defaultValue={school?.name ?? ""}
            placeholder="School name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-nameNp"><TranslatedText>
            Name in Nepali</TranslatedText><TranslatedText>{" "}</TranslatedText>
            <span className="text-muted-foreground font-normal"><TranslatedText>(optional)</TranslatedText></span>
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
          <Label htmlFor="school-address"><TranslatedText>Address</TranslatedText></Label>
          <Input
            id="school-address"
            name="address"
            defaultValue={school?.address ?? ""}
            placeholder="Address"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-phone"><TranslatedText>Phone</TranslatedText></Label>
          <Input
            id="school-phone"
            name="phone"
            defaultValue={school?.phone ?? ""}
            placeholder="Phone number"
            inputMode="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-email"><TranslatedText>Email</TranslatedText></Label>
          <Input
            id="school-email"
            name="email"
            defaultValue={school?.email ?? ""}
            placeholder="Email address"
            type="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="school-language"><TranslatedText>Interface language</TranslatedText></Label>
          <FieldSelect
            id="school-language"
            name="language"
            defaultValue={school?.language ?? "en"}
            aria-label="Interface language"
            options={[
              { value: "en", label: "English" },
              { value: "ne", label: "Nepali" },
            ]}
          />
          <p className="text-muted-foreground text-xs">
            <TranslatedText>Used for the sign-in page and staff workspace. School-entered names and records are not translated.</TranslatedText>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label><TranslatedText>School logo</TranslatedText></Label>
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
          <TranslatedText>{pending ? "Saving…" : "Save school details"}</TranslatedText>
        </Button>
        {state.error ? (
          <p className="text-destructive text-sm">
            <TranslatedText>{state.error}</TranslatedText>
          </p>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        <TranslatedText>
          These appear in the dashboard header and on the letterhead of every printed marksheet. The logo also appears on the sign-in page.
        </TranslatedText>
      </p>
    </form>
  );
}
