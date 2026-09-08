"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDevanagari, transliterateName } from "@/lib/nepali/transliterate";

// First / middle / last, plus the Nepali name with a suggestion derived from the
// English spelling. The suggestion follows along only until someone edits the
// Nepali field — after that it is theirs, and never overwritten.
export function NameFields({
  idPrefix,
  firstName = "",
  middleName = "",
  lastName = "",
  fullNameNp = "",
}: {
  idPrefix: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullNameNp?: string;
}) {
  const [first, setFirst] = useState(firstName);
  const [middle, setMiddle] = useState(middleName);
  const [last, setLast] = useState(lastName);

  const [nepali, setNepali] = useState(fullNameNp);
  // An existing Nepali name counts as already edited, so loading a record for
  // editing never clobbers a spelling someone corrected by hand.
  const [touched, setTouched] = useState(fullNameNp.trim() !== "");

  const english = [first, middle, last].map((p) => p.trim()).filter(Boolean).join(" ");
  const suggestion = english ? transliterateName(english) : "";

  const shown = touched ? nepali : suggestion;
  const canSuggest =
    touched && suggestion !== "" && suggestion !== nepali && !isDevanagari(english);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}firstName`}><TranslatedText>First name</TranslatedText></Label>
        <Input
          id={`${idPrefix}firstName`}
          name="firstName"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="First name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}middleName`}><TranslatedText>
          Middle name</TranslatedText><TranslatedText>{" "}</TranslatedText>
          <span className="text-muted-foreground font-normal"><TranslatedText>(optional)</TranslatedText></span>
        </Label>
        <Input
          id={`${idPrefix}middleName`}
          name="middleName"
          value={middle}
          onChange={(e) => setMiddle(e.target.value)}
          placeholder="Middle name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}lastName`}><TranslatedText>Last name</TranslatedText></Label>
        <Input
          id={`${idPrefix}lastName`}
          name="lastName"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder="Last name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}fullNameNp`}><TranslatedText>
          Name in Nepali</TranslatedText><TranslatedText>{" "}</TranslatedText>
          <span className="text-muted-foreground font-normal"><TranslatedText>(optional)</TranslatedText></span>
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}fullNameNp`}
            name="fullNameNp"
            value={shown}
            onChange={(e) => {
              setTouched(true);
              setNepali(e.target.value);
            }}
            placeholder="Full name in Devanagari"
            lang="ne"
          />
          {canSuggest ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Use the suggested Nepali spelling"
              title={`Suggest ${suggestion}`}
              onClick={() => {
                setNepali(suggestion);
                setTouched(true);
              }}
            >
              <Sparkles />
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          <TranslatedText>{touched
            ? "Edited by hand — no longer follows the English name."
            : english
              ? "Suggested from the English spelling. Correct it if it is wrong."
              : "Fills in as you type the English name."}</TranslatedText>
        </p>
      </div>
    </>
  );
}
