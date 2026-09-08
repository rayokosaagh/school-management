import { cn } from "@/lib/utils";
import { TranslatedText } from "@/components/i18n/language-provider";

export function Kpi({
  value,
  label,
  hint,
  className,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("bg-surface border-line rounded-[10px] border px-4 py-3", className)}>
      <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="text-ink-2 mt-1.5 text-sm"><TranslatedText>{label}</TranslatedText></p>
      {hint ? <p className="text-ink-3 text-xs"><TranslatedText>{hint}</TranslatedText></p> : null}
    </div>
  );
}
