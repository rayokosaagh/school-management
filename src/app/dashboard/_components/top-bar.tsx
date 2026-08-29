import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccountMenu } from "./account-menu";
import { YearSwitcher } from "./year-switcher";

export function TopBar({
  school,
  today,
  years,
  currentId,
  span,
  todayInYear,
  username,
  roleLabel,
  allowed,
  alerts,
}: {
  school: { name: string; address: string | null };
  today: string;
  years: { id: number; nameBS: string; sections: number }[];
  currentId: number | null;
  span: string | null;
  todayInYear: boolean;
  username: string;
  roleLabel: string;
  allowed: string[];
  /// The alerts button, rendered by the layout because it needs the overview.
  alerts?: ReactNode;
}) {
  return (
    <header className="bg-surface border-line no-print col-span-full flex h-[var(--topbar)] items-center gap-3 border-b px-3 shell:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandMark name={school.name} />
        <div className="shell:block hidden min-w-0">
          <p className="font-display truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">
            {school.name}
          </p>
          <p className="text-ink-3 truncate text-[11.5px] leading-tight">
            {[school.address, today].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {/* Centre slot: the global search trigger lands here in Phase 3. */}
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <YearSwitcher years={years} currentId={currentId} span={span} todayInYear={todayInYear} />
        {alerts}
        <ThemeToggle />
        <AccountMenu username={username} roleLabel={roleLabel} allowed={allowed} />
      </div>
    </header>
  );
}
