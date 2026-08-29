import { cn } from "@/lib/utils";

/// The aside shell: identity block, action row, then labelled sections.
export function DetailPane({
  title,
  subtitle,
  initials,
  photo,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  initials: string;
  photo?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="border-line flex items-start gap-3 border-b px-5 pt-[18px] pb-3.5">
        {photo ?? (
          <span
            aria-hidden="true"
            className="from-brand-tint-2 to-brand-tint text-brand-text font-display grid size-13 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg font-bold"
          >
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-semibold tracking-[-0.015em]">{title}</p>
          {subtitle ? <p className="text-ink-3 mt-0.5 text-[12.5px]">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="border-line flex gap-1.5 border-b px-5 py-3">{actions}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-line border-b px-5 py-3.5 last:border-b-0", className)}>
      <h2 className="text-ink-3 mb-2.5 text-[11px] font-medium tracking-[0.1em] uppercase">{label}</h2>
      {children}
    </section>
  );
}

/// Two-column label/value grid for the Record section.
function Facts({ items }: { items: { label: string; value: React.ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-ink-3 text-[11.5px]">{f.label}</dt>
          <dd className={cn("mt-px truncate font-medium", f.mono && "font-mono tabular-nums")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

DetailPane.Section = Section;
DetailPane.Facts = Facts;
