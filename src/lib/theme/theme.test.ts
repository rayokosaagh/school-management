import { describe, expect, it } from "vitest";
import { NO_FLASH_SCRIPT, THEME_KEY, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("follows the stored preference when it is explicit", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system when nothing or 'system' is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("treats garbage as system", () => {
    expect(resolveTheme("blue", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("NO_FLASH_SCRIPT", () => {
  /// The script names `localStorage`, `window` and `document` as free
  /// identifiers, so `new Function` parameters of the same names shadow the
  /// real globals and the script runs against these stubs instead.
  function run(stored: string | null, systemDark: boolean) {
    const classes = new Set<string>();
    const localStorage = { getItem: (key: string) => (key === THEME_KEY ? stored : null) };
    const window = { matchMedia: (query: string) => ({ matches: query.includes("dark") && systemDark }) };
    const document = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
    new Function("localStorage", "window", "document", NO_FLASH_SCRIPT)(localStorage, window, document);
    return classes;
  }

  it("adds the dark class when dark is stored", () => {
    expect(run("dark", false).has("dark")).toBe(true);
  });

  it("adds the dark class when nothing is stored and the system is dark", () => {
    expect(run(null, true).has("dark")).toBe(true);
  });

  it("leaves the class off when light is stored, even on a dark system", () => {
    expect(run("light", true).has("dark")).toBe(false);
  });

  it("leaves the class off when nothing is stored and the system is light", () => {
    expect(run(null, false).has("dark")).toBe(false);
  });

  it("agrees with resolveTheme on every case it covers", () => {
    for (const stored of ["dark", "light", "system", null]) {
      for (const systemDark of [true, false]) {
        expect(run(stored, systemDark).has("dark")).toBe(resolveTheme(stored, systemDark) === "dark");
      }
    }
  });
});
