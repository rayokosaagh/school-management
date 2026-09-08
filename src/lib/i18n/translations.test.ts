import { describe, expect, it } from "vitest";
import { normalizeLanguage, translate, translateInterface } from "./translations";

describe("interface language", () => {
  it("normalizes stored values and safely falls back to English", () => {
    expect(normalizeLanguage("ne")).toBe("ne");
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("fr")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });

  it("translates known interface copy without touching unknown school data", () => {
    expect(translate("ne", "Students")).toBe("विद्यार्थीहरू");
    expect(translate("ne", "  Name  ")).toBe("  नाम  ");
    expect(translate("ne", "Shree Janata School")).toBe("Shree Janata School");
    expect(translate("en", "Students")).toBe("Students");
  });

  it("normalizes layout whitespace before looking up copy", () => {
    expect(translate("ne", "Every section\n has a saved register.")).toBe(
      "हरेक सेक्सनको हाजिरी सुरक्षित गरिएको छ।",
    );
  });

  it("translates interface phrases around live values", () => {
    expect(translateInterface("ne", "3 students")).toBe("3 विद्यार्थीहरू");
    expect(translateInterface("ne", "Manage assignments for Ram")).toBe(
      "जिम्मेवारी व्यवस्थापन: Ram",
    );
  });
});
