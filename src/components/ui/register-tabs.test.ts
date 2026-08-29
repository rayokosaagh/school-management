import { expect, it } from "vitest";
import { registerTabId } from "./register-tabs";

it("slugifies a tab key into a DOM-safe id", () => {
  // Designations are free text, so a tab key can carry spaces and case that
  // would otherwise land in an `id` (and in the panel's `aria-labelledby`).
  expect(registerTabId("r1", "Vice Principal")).toBe("r1-tab-vice-principal");
  expect(registerTabId("r1", "12")).toBe("r1-tab-12");
});
