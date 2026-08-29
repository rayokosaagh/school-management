import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, prefsKey } from "./prefs";

describe("parsePrefs", () => {
  it("returns defaults for null or invalid JSON", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
  });
  it("keeps valid fields and repairs invalid ones", () => {
    expect(parsePrefs(JSON.stringify({ density: "compact", pageSize: 50, hidden: ["born"] }))).toEqual({
      density: "compact",
      pageSize: 50,
      hidden: ["born"],
    });
    expect(parsePrefs(JSON.stringify({ density: "huge", pageSize: 7, hidden: "born" }))).toEqual(DEFAULT_PREFS);
  });
});

it("namespaces the storage key", () => {
  expect(prefsKey("students")).toBe("table:students");
});
