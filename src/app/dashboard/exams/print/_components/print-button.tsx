"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-sm">
        {count}<TranslatedText> marksheet</TranslatedText><TranslatedText>{count === 1 ? "" : "s"}</TranslatedText><TranslatedText>, one per page
      </TranslatedText></span>
      <Button type="button" variant="action" size="xl" onClick={() => window.print()}>
        <Printer /><TranslatedText>
        Print
      </TranslatedText></Button>
    </div>
  );
}
