import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/// An empty screen is an invitation to act: one icon, one sentence, one action.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      <span className="bg-brand-tint text-brand-text grid size-11 place-items-center rounded-xl">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-1 text-sm font-medium">{title}</p>
      {description ? <p className="text-ink-3 max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
