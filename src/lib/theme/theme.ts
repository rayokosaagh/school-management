export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_KEY = "theme";

/// Explicit light/dark wins; anything else (missing, "system", garbage) follows
/// the operating system.
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return systemDark ? "dark" : "light";
}

/// Runs inline in <head> before paint so a dark-mode user never sees a white
/// flash. Must stay dependency-free and mirror resolveTheme exactly.
export const NO_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

/// Browser only. Sets the class the CSS keys off and remembers the choice.
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the class still applies for this page.
  }
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
