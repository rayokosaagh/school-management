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
  it("reads the same storage key and toggles the dark class", () => {
    expect(NO_FLASH_SCRIPT).toContain(`"${THEME_KEY}"`);
    expect(NO_FLASH_SCRIPT).toContain("classList.add(\"dark\")");
    expect(NO_FLASH_SCRIPT).toContain("prefers-color-scheme: dark");
  });
});
