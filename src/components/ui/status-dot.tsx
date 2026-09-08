import { cn } from "@/lib/utils";
import { TranslatedText } from "@/components/i18n/language-provider";

export type StatusTone = "ok" | "warn" | "bad" | "brand" | "neutral";

const DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  brand: "bg-brand",
  neutral: "bg-ink-3",
};

/// A dot plus a word. The word is the status; the dot is a glance.
export function StatusDot({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-ink-2 inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", DOT[tone])} />
      {typeof children === "string" ? <TranslatedText>{children}</TranslatedText> : children}
    </span>
  );
}
