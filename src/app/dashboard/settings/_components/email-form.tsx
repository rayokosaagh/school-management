"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { useToastedActionState } from "@/components/ui/toast";
import { AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { updateEmail, type EmailState } from "../actions";

const INITIAL: EmailState = {};

export function EmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [state, formAction, pending] = useToastedActionState(updateEmail, INITIAL);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="email"><TranslatedText>Email</TranslatedText></Label>
        <div className="relative mt-2.5">
          <Input
            id="email"
            name="email"
            type="email"
            className="peer ps-9"
            placeholder="you@example.com"
            autoComplete="email"
            defaultValue={currentEmail ?? ""}
            disabled={pending}
          />
          <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
            <AtSign size={16} aria-hidden="true" />
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          <TranslatedText>{currentEmail
            ? "You can sign in with either your username or this address."
            : "Add an address to sign in with it as well as your username."}</TranslatedText>
        </p>
      </div>

      {/* aria-live so the result is announced, not just shown. */}
      <div aria-live="polite" className="min-h-5">
        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {state.success}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <TranslatedText>{pending ? "Saving…" : "Save email"}</TranslatedText>
        </Button>
        {pending && (
          <MorphingSquare
            className="h-4 w-4 bg-muted-foreground"
            message="Saving"
            messagePlacement="right"
            aria-label="Saving"
          />
        )}
      </div>
    </form>
  );
}
