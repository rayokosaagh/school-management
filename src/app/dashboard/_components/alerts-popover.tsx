"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DueItem } from "@/lib/dashboard/alerts";
import { cn } from "@/lib/utils";

export function AlertsPopover({ items }: { items: DueItem[] }) {
  const n = items.length;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={n === 0 ? "Nothing needs attention" : `${n} ${n === 1 ? "thing needs" : "things need"} attention`}
        className="text-ink-2 hover:bg-page focus-visible:ring-ring/50 relative grid size-8 place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none"
      >
        <Bell className="size-4.5" aria-hidden="true" />
        {n > 0 ? (
          <span aria-hidden="true" className="bg-bad border-surface absolute top-1.5 right-1.5 size-2 rounded-full border-2" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="text-ink-3 px-3 pt-2 pb-1 text-caption font-medium tracking-[0.1em] uppercase"><TranslatedText>
          Needs attention
        </TranslatedText></p>
        {n === 0 ? (
          <p className="text-ink-3 px-3 pb-3 text-sm"><TranslatedText>Everything is up to date.</TranslatedText></p>
        ) : (
          <ul className="pb-1">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="hover:bg-page flex items-center gap-2.5 rounded-md px-3 py-2 text-sm no-underline"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      item.tone === "warn" && "bg-warn",
                      item.tone === "bad" && "bg-bad",
                      item.tone === "neutral" && "bg-ink-3",
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="text-ink-3 size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
