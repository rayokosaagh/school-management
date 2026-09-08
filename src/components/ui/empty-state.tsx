import type { LucideIcon } from "lucide-react";
import { TINT_CLASSES, type Tint } from "@/components/ui/page-shell";
import { cn } from "@/lib/utils";
import { TranslatedText } from "@/components/i18n/language-provider";

/// An empty screen is an invitation to act: one icon, one sentence, one
/// action. `tint` defaults to the brand colour but a page should pass its own
/// section tint — the same one its header icon and rail item use — so an
/// empty table still reads as belonging to that section.
export function EmptyState({
  icon: Icon,
  tint = "violet",
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  tint?: Tint;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      <span className={cn("grid size-11 place-items-center rounded-xl", TINT_CLASSES[tint])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-1 text-sm font-medium"><TranslatedText>{title}</TranslatedText></p>
      {description ? <p className="text-ink-3 max-w-sm text-sm"><TranslatedText>{description}</TranslatedText></p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
