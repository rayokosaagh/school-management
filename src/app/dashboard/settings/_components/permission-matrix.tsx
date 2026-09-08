"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Check, Lock, Minus, RotateCcw } from "lucide-react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/auth/roles";
import {
  type AccountState,
  restoreDefaultPermissions,
  togglePermission,
} from "../actions";

const EMPTY: AccountState = {};

export type MatrixCapability = {
  key: string;
  label: string;
  note?: string;
  /// Per role: whether it is currently allowed, and whether that differs from
  /// the built-in default.
  roles: Record<string, { allowed: boolean; changed: boolean }>;
};

const EDITABLE = ["OFFICE", "TEACHER"] as const;

function Cell({
  capability,
  role,
  allowed,
  changed,
}: {
  capability: string;
  role: string;
  allowed: boolean;
  changed: boolean;
}) {
  const [, action, pending] = useToastedActionState(togglePermission, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="capability" value={capability} />
      <input type="hidden" name="allow" value={allowed ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={allowed}
        aria-label={`${allowed ? "Block" : "Allow"} ${capability} for ${role}`}
        title={changed ? "Changed from the default" : undefined}
        className={[
          "focus-visible:ring-ring/50 grid size-9 place-items-center rounded-lg border transition-colors focus-visible:ring-3 focus-visible:outline-none",
          allowed
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-muted text-muted-foreground",
          pending ? "opacity-50" : "hover:brightness-95",
          // A dot marks a cell the school has moved away from the default.
          changed ? "ring-tint-amber-fg/40 ring-2" : "",
        ].join(" ")}
      >
        {allowed ? <Check className="size-4" /> : <Minus className="size-4" />}
      </button>
    </form>
  );
}

export function PermissionMatrix({
  capabilities,
  anyChanged,
}: {
  capabilities: MatrixCapability[];
  anyChanged: boolean;
}) {
  const [, resetAction, resetting] = useToastedActionState(
    restoreDefaultPermissions,
    EMPTY,
  );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium"><TranslatedText>Permission</TranslatedText></th>
              <th className="w-24 py-2 text-center font-medium">
                {ROLE_LABEL.ADMIN}
              </th>
              {EDITABLE.map((role) => (
                <th key={role} className="w-24 py-2 text-center font-medium">
                  {ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.key} className="border-b last:border-0">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{capability.label}</p>
                  {capability.note ? (
                    <p className="text-muted-foreground text-xs">{capability.note}</p>
                  ) : null}
                </td>
                <td className="py-2.5">
                  <div className="flex justify-center">
                    <span
                      className="text-muted-foreground grid size-9 place-items-center rounded-lg border border-dashed"
                      title="Administrators always hold every permission"
                    >
                      <Lock className="size-3.5" />
                    </span>
                  </div>
                </td>
                {EDITABLE.map((role) => (
                  <td key={role} className="py-2.5">
                    <div className="flex justify-center">
                      <Cell
                        capability={capability.key}
                        role={role}
                        allowed={capability.roles[role].allowed}
                        changed={capability.roles[role].changed}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs"><TranslatedText>
          Administrators are fixed at full access — otherwise this page could be
          used to lock everyone out of it. Changes apply immediately.
        </TranslatedText></p>
        {anyChanged ? (
          <form action={resetAction}>
            <Button type="submit" variant="outline" size="sm" disabled={resetting}>
              <RotateCcw />
              <TranslatedText>{resetting ? "Restoring…" : "Restore defaults"}</TranslatedText>
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
