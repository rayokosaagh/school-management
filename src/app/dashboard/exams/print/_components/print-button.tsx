"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-sm">
        {count} marksheet{count === 1 ? "" : "s"}, one per page
      </span>
      <Button type="button" variant="action" size="xl" onClick={() => window.print()}>
        <Printer />
        Print
      </Button>
    </div>
  );
}
