import { expect, it } from "vitest";
import { registerTabId } from "./register-tabs";

it("slugifies a tab key into a DOM-safe id", () => {
  // Designations are free text, so a tab key can carry spaces and case that
  // would otherwise land in an `id` (and in the panel's `aria-labelledby`).
  expect(registerTabId("r1", "Vice Principal")).toBe("r1-tab-vice-principal");
  expect(registerTabId("r1", "12")).toBe("r1-tab-12");
});

it("gives two different Devanagari designations two different ids", () => {
  // Both used to strip to the same empty slug ("r1-tab-"), producing a
  // duplicate DOM id and a panel whose aria-labelledby resolved to whichever
  // tab came first, regardless of which one was actually selected.
  const headteacher = registerTabId("r1", "प्रधानाध्यापक");
  const deputy = registerTabId("r1", "उप-प्रधानाध्यापक");
  expect(headteacher).not.toBe(deputy);
});

it("produces a usable id for a tab key with no ASCII characters at all", () => {
  const id = registerTabId("r1", "प्रधानाध्यापक");
  expect(id.startsWith("r1-tab-")).toBe(true);
  expect(id.length).toBeGreaterThan("r1-tab-".length);
  expect(/\s/.test(id)).toBe(false);
  expect(/^[0-9]/.test(id)).toBe(false);
});

it("is stable across renders: the same tab key always slugs the same way", () => {
  const a = registerTabId("r1", "प्रधानाध्यापक");
  const b = registerTabId("r1", "प्रधानाध्यापक");
  expect(a).toBe(b);
});

it("does not let an adversarial ASCII id collide with a non-ASCII id's fingerprint", () => {
  // The "_" + fingerprint suffix is only reachable via the non-ASCII path:
  // "_" always folds into "-" in the plain ASCII slug, so an ASCII tab key
  // that happens to spell out what a fingerprint would look like still
  // can't land on the same id as the non-ASCII key it imitates.
  const nonAscii = registerTabId("r1", "kaअ");
  const lookalike = registerTabId("r1", "ka_006b00610905");
  expect(nonAscii).not.toBe(lookalike);
});
