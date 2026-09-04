"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconTile, type Tint } from "@/components/ui/page-shell";
import { FieldSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/// The five settings groups, ordered from the school's own identity down to
/// the rarely-touched restore points. Kept as a const array (not just the
/// type) so page.tsx and this file share one source of truth for validating
/// `?view=`.
export const SETTINGS_GROUP_IDS = ["school", "privacy", "academic", "account", "data"] as const;
export type SettingsGroupId = (typeof SETTINGS_GROUP_IDS)[number];

/// "school" needs no `?view=` at all, matching the Students register/honours
/// switch where the default view leaves a bare URL.
const DEFAULT_GROUP: SettingsGroupId = "school";

export type SettingsGroup = {
  id: SettingsGroupId;
  label: string;
  /** One line, shown in the rail, the narrow dropdown's context, and the
   *  panel heading — so a group is never offered without saying what's in it. */
  description: string;
  icon: LucideIcon;
  tint: Tint;
  content: ReactNode;
};

function GroupBlurb({ group, size }: { group: SettingsGroup; size: "sm" | "md" }) {
  return (
    <>
      <IconTile icon={group.icon} tint={group.tint} size={size} />
      <span className="min-w-0">
        <span className={cn("block", size === "sm" ? "text-sm font-medium" : "text-base font-semibold")}>
          {group.label}
        </span>
        <span className="text-ink-3 mt-0.5 block text-xs leading-snug">{group.description}</span>
      </span>
    </>
  );
}

/// Google-settings-style layout: a group list beside (or, on a phone, above)
/// a panel showing the selected group's cards. The active group lives in
/// `?view=`, not local state, so a reload or a shared link lands on the same
/// one — the same idiom the Students register/honours switch uses.
export function SettingsWorkspace({
  view,
  groups,
}: {
  view: SettingsGroupId;
  groups: SettingsGroup[];
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const active = groups.find((g) => g.id === view) ?? groups[0];

  function switchGroup(next: SettingsGroupId) {
    if (next === active.id) return;
    startNavigation(() => router.replace(next === DEFAULT_GROUP ? "?" : `?view=${next}`, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-4 shell:flex-row shell:items-start shell:gap-6">
      {/* Below the shell breakpoint there's no room for a rail beside the
          panel, but every group still has to be one tap away — a dropdown
          costs nothing on the vertical axis a phone doesn't have. */}
      <div className="shell:hidden">
        <FieldSelect
          aria-label="Settings section"
          className="w-full"
          value={active.id}
          onValueChange={(next) => next && switchGroup(next as SettingsGroupId)}
          options={groups.map((g) => ({ value: g.id, label: g.label }))}
        />
      </div>

      <nav aria-label="Settings sections" className="hidden shrink-0 shell:block shell:w-72">
        <ul className="flex flex-col gap-1">
          {groups.map((group) => {
            const isActive = group.id === active.id;
            return (
              <li key={group.id}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => switchGroup(group.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    isActive ? "bg-brand-tint text-brand-text" : "text-ink hover:bg-surface-2",
                  )}
                >
                  <GroupBlurb group={group} size="sm" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex items-start gap-3">
          <GroupBlurb group={active} size="md" />
        </div>
        {active.content}
      </div>
    </div>
  );
}
