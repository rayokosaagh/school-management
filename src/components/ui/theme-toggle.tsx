"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";

/// Reads the class the no-flash script already set, so the icon matches the
/// page from the first client render.
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTheme(currentTheme()), []);

  const dark = theme === "dark";
  function toggle() {
    const next: Theme = dark ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
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
