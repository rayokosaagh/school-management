"use client";

import { Moon, Sun } from "lucide-react";
import { applyTheme } from "@/lib/theme/theme";
import { useTheme } from "@/lib/theme/use-theme";
import { cn } from "@/lib/utils";

/// Reads the class the no-flash script already set, so the icon matches the
/// page from the first client render — and follows the account menu's "Switch
/// theme" too, since both go through `applyTheme`.
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useTheme() === "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(dark ? "light" : "dark")}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "text-ink-2 hover:bg-page grid size-8 place-items-center rounded-lg transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
        className,
      )}
    >
      {dark ? <Moon className="size-4.5" aria-hidden="true" /> : <Sun className="size-4.5" aria-hidden="true" />}
    </button>
  );
}
