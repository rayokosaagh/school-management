"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_IDS, SETTINGS, activeId, visibleGroups, type NavItem } from "./nav-model";

function RailLink({ item, active, className }: { item: NavItem; active: boolean; className?: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-ink-3 hover:bg-page hover:text-ink flex h-13 flex-col items-center justify-center gap-1 rounded-[9px] text-[10.5px] font-medium tracking-[0.01em] no-underline transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
        active && "bg-brand-tint text-brand-text",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/// 64px icon rail from the `shell` breakpoint up; a five-item bottom bar below.
export function IconRail({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const current = activeId(pathname);
  const groups = visibleGroups(allowed);
  const mobile = groups
    .flatMap((g) => g.items)
    .filter((i) => MOBILE_IDS.includes(i.id));

  return (
    <>
      <nav
        aria-label="Main"
        className="bg-surface border-line shell:flex hidden w-[var(--rail)] flex-col border-r py-2"
      >
        {groups.map((group, i) => (
          <div
            key={group.id}
            className={cn("flex flex-col gap-0.5 px-2 py-1.5", i > 0 && "border-line mt-1 border-t pt-2.5")}
          >
            {group.items.map((item) => (
              <RailLink key={item.id} item={item} active={current === item.id} />
            ))}
          </div>
        ))}
        <div className="flex-1" />
        {allowed.includes(SETTINGS.id) ? (
          <div className="px-2 py-1.5">
            <RailLink item={SETTINGS} active={current === SETTINGS.id} />
          </div>
        ) : null}
      </nav>

      <nav
        aria-label="Main"
        className="bg-surface border-line shell:hidden fixed inset-x-0 bottom-0 z-20 flex border-t px-1 pt-1 pb-[max(4px,env(safe-area-inset-bottom))]"
      >
        {mobile.map((item) => (
          <RailLink key={item.id} item={item} active={current === item.id} className="flex-1" />
        ))}
      </nav>
    </>
  );
}
