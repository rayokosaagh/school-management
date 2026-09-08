"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <Button type="button" variant="action" size="xl" onClick={() => window.print()}>
        <Printer /><TranslatedText>
        Print
      </TranslatedText></Button>
    </div>
  );
}
