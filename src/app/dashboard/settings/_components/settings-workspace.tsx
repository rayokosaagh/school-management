"use client";

import {
  Building2,
  History,
  KeyRound,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconTile, type Tint } from "@/components/ui/page-shell";
import { FieldSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// The group ids live in a plain module rather than here: this file is a
// client component, and a value it exports reaches a server component as a
// client-reference proxy rather than the value itself.
import { DEFAULT_SETTINGS_GROUP, type SettingsGroupId } from "./settings-groups";

export type { SettingsGroupId };

/// "school" needs no `?view=` at all, matching the Students register/honours
/// switch where the default view leaves a bare URL.
const DEFAULT_GROUP: SettingsGroupId = DEFAULT_SETTINGS_GROUP;

/// Icons live here rather than travelling with each group from the server
/// page: a component is a function, and a function cannot be passed across the
/// server/client boundary as a prop. The group's id is enough to look one up.
const GROUP_ICONS: Record<SettingsGroupId, LucideIcon> = {
  school: Building2,
  privacy: ShieldCheck,
  academic: Trophy,
  account: KeyRound,
  data: History,
};

export type SettingsGroup = {
  id: SettingsGroupId;
  label: string;
  /** One line, shown in the rail, the narrow dropdown's context, and the
   *  panel heading — so a group is never offered without saying what's in it. */
  description: string;
  tint: Tint;
  content: ReactNode;
};

function GroupBlurb({ group, size }: { group: SettingsGroup; size: "sm" | "md" }) {
  return (
    <>
      <IconTile icon={GROUP_ICONS[group.id]} tint={group.tint} size={size} />
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
  const [isPending, startNavigation] = useTransition();
  const reduce = useReducedMotion();
  const active = groups.find((g) => g.id === view) ?? groups[0];

  function switchGroup(next: SettingsGroupId) {
    if (next === active.id) return;
    startNavigation(() => router.replace(next === DEFAULT_GROUP ? "?" : `?view=${next}`, { scroll: false }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 shell:flex-row shell:items-start shell:gap-6">
      {/* Below the shell breakpoint there's no room for a rail beside the
          panel, but every group still has to be one tap away — a dropdown
          costs nothing on the vertical axis a phone doesn't have. */}
      <div className="bg-surface border-line rounded-[10px] border p-2 shadow-panel shell:hidden">
        <p className="text-ink-3 mb-1 px-1 text-[11px] font-medium tracking-[0.1em] uppercase">
          Settings area
        </p>
        <FieldSelect
          aria-label="Settings section"
          className="w-full"
          value={active.id}
          onValueChange={(next) => next && switchGroup(next as SettingsGroupId)}
          disabled={isPending}
          options={groups.map((g) => ({ value: g.id, label: g.label }))}
        />
      </div>

      <nav
        aria-label="Settings sections"
        className="bg-surface border-line hidden shrink-0 rounded-[10px] border p-2 shadow-panel shell:block shell:w-72"
      >
        <p className="text-ink-3 px-2 py-1.5 text-[11px] font-medium tracking-[0.1em] uppercase">
          Settings areas
        </p>
        <ul className="flex flex-col gap-1">
          {groups.map((group) => {
            const isActive = group.id === active.id;
            return (
              <li key={group.id}>
                <motion.button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => switchGroup(group.id)}
                  disabled={isPending}
                  whileHover={reduce ? undefined : { x: 2 }}
                  whileTap={reduce ? undefined : { scale: 0.99 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className={cn(
                    "relative flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] disabled:cursor-wait disabled:opacity-60",
                    isActive
                      ? "border-brand-tint-2 bg-brand-tint text-brand-text shadow-sm"
                      : "border-transparent text-ink hover:bg-surface-2",
                  )}
                >
                  <GroupBlurb group={group} size="sm" />
                </motion.button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        aria-busy={isPending}
        className={cn(
          "min-w-0 flex-1 space-y-4 transition-opacity",
          isPending && "opacity-60",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-4"
          >
            <div className="bg-surface border-line flex items-start gap-3 rounded-[10px] border px-4 py-3 shadow-panel">
              <GroupBlurb group={active} size="md" />
            </div>
            <div className="space-y-5">{active.content}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
