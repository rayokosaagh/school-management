"use client";

import { useLayoutEffect } from "react";
import { applyTheme, resolveTheme, THEME_KEY } from "@/lib/theme/theme";

/// Applies the persisted preference without rendering a script node. React 19
/// intentionally does not execute script tags introduced during client render.
export function ThemeBootstrap() {
  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
    applyTheme(resolveTheme(stored, window.matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);

  return null;
}
