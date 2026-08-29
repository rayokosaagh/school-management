"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Two-step confirm rather than a modal: destructive actions in a dense admin UI
// should be hard to hit by accident but cheap to back out of. Reverts on its own
// so a half-pressed delete never sits armed.
export function ConfirmSubmit({
  label = "Delete",
  confirmLabel = "Really delete?",
  pending = false,
  pendingLabel = "Deleting…",
  size = "sm",
  icon = false,
  title,
  disabled = false,
}: {
  label?: string;
  confirmLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  size?: "xs" | "sm" | "default";
  /// Row strips have no room for a worded button, so the unarmed state is a
  /// bin. Arming still shows words — a destructive click is never a bare icon.
  icon?: boolean;
  title?: string;
  /// When true, the unarmed button is disabled (with `title` as its tooltip)
  /// and cannot be armed — for actions blocked server-side, so the user sees
  /// why before they try.
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (pending) {
    return (
      <Button type="button" variant="destructive" size={size} disabled>
        {pendingLabel}
      </Button>
    );
  }

  if (!armed) {
    if (icon) {
      return (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setArmed(true)}
          aria-label={title ?? label}
          title={title ?? label}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant="destructive"
        size={size}
        onClick={() => setArmed(true)}
        disabled={disabled}
        title={disabled ? title : undefined}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button type="submit" variant="destructive" size={icon ? "xs" : size}>
        {confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={icon ? "xs" : size}
        onClick={() => setArmed(false)}
      >
        Cancel
      </Button>
    </span>
  );
}
