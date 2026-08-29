import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The tinted icon tile that heads every page and card. Tint is chosen per
// section so the eye can tell them apart while scrolling, not for decoration.
export type Tint = "violet" | "blue" | "green" | "amber" | "rose";

const TINTS: Record<Tint, string> = {
  violet: "bg-tint-violet text-tint-violet-fg",
  blue: "bg-tint-blue text-tint-blue-fg",
  green: "bg-tint-green text-tint-green-fg",
  amber: "bg-tint-amber text-tint-amber-fg",
  rose: "bg-tint-rose text-tint-rose-fg",
};

export function IconTile({
  icon: Icon,
  tint = "blue",
  size = "md",
}: {
  icon: LucideIcon;
  tint?: Tint;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "lg" ? "size-12 rounded-2xl" : size === "sm" ? "size-8 rounded-lg" : "size-10 rounded-xl";
  const glyph = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";

  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center", box, TINTS[tint])}
    >
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}

export function PageHeader({
  icon,
  tint = "violet",
  title,
  meta,
}: {
  icon: LucideIcon;
  tint?: Tint;
  title: string;
  /** Short facts, joined with a dot separator. */
  meta?: ReactNode[];
}) {
  const shown = (meta ?? []).filter(Boolean);

  return (
    <header className="flex items-center gap-4">
      <IconTile icon={icon} tint={tint} size="lg" />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {shown.length > 0 ? (
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
            {shown.map((item, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden="true">·</span> : null}
                {item}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export function SectionCard({
  icon,
  tint = "blue",
  title,
  description,
  actions,
  children,
  className,
}: {
  icon: LucideIcon;
  tint?: Tint;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-surface p-5", className)}>
      <div className="mb-5 flex items-start gap-3">
        <IconTile icon={icon} tint={tint} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/// Tinted callout for empty states and warnings, matching the section tints.
export function Callout({
  icon: Icon,
  tint = "amber",
  children,
}: {
  icon?: LucideIcon;
  tint?: Tint;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm",
        TINTS[tint],
      )}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
