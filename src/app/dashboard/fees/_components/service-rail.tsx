"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FieldSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ServiceChoice = {
  /// "transport", or `plan:7` / `head:12` for a per-student fee.
  value: string;
  label: string;
  /// What it costs and how often, under the name. Real information rather than
  /// invented blurb: there is no description field on a fee type, and
  /// "Books, reading resources" would be a sentence the school never wrote.
  note: string;
  icon: LucideIcon;
  /// Registered pupils. Shown even at zero — a service nobody is on is the
  /// one most worth noticing.
  count: number;
};

/// The list of the school's services, down the side of the Services step.
///
/// Built from what actually exists — transport plus every per-student fee type
/// — so adding a fee type adds a row here and nothing has to be registered in
/// two places. Modelled on the Classes rail in Class pricing, so the two steps
/// of setup navigate the same way.
export function ServiceRail({
  services,
  value,
  onChange,
  disabled = false,
}: {
  services: ServiceChoice[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <aside className="border-line bg-surface-2/50 min-w-0 rounded-t-xl border-b p-4 lg:rounded-tr-none lg:rounded-bl-xl lg:border-r lg:border-b-0 lg:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold"><TranslatedText>Services</TranslatedText></h3>
        <span className="text-ink-3 text-xs">
          {services.length} <TranslatedText>{services.length === 1 ? "service" : "services"}</TranslatedText>
        </span>
      </div>
      <p className="text-ink-3 mb-4 text-xs leading-5"><TranslatedText>
        Transport, library and anything else charged to the pupils who take it. Only registered
        students are billed.
      </TranslatedText></p>

      <div className="lg:hidden">
        <FieldSelect
          aria-label="Service"
          value={value}
          onValueChange={(next) => onChange(next ?? value)}
          disabled={disabled}
          options={services.map((service) => ({
            value: service.value,
            label: `${service.label} · ${service.count}`,
          }))}
        />
      </div>

      <nav aria-label="Services" className="hidden max-h-[65vh] space-y-1 overflow-y-auto lg:block">
        {services.map((service) => {
          const active = service.value === value;
          return (
            <button
              key={service.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(service.value)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "focus-visible:ring-brand flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
                active ? "bg-brand-tint text-brand-text" : "text-ink-2 hover:bg-surface",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg",
                  active ? "bg-brand-tint-2 text-brand-text" : "border-line bg-surface text-ink-3 border",
                )}
              >
                <service.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{service.label}</span>
                <span className={cn("mt-0.5 block truncate text-xs", active ? "text-brand-text/80" : "text-ink-3")}>
                  {service.note}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 font-mono text-[11px] tabular-nums",
                  active ? "bg-brand-tint-2 text-brand-text" : "text-ink-3",
                )}
              >
                {service.count}
              </span>
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
