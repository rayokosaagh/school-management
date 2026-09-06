import { describe, expect, it } from "vitest";
import { MOBILE_IDS, NAV_GROUPS, SETTINGS, activeId, visibleGroups } from "./nav-model";

describe("activeId", () => {
  it("picks the longest matching prefix", () => {
    expect(activeId("/dashboard")).toBe("home");
    expect(activeId("/dashboard/students")).toBe("students");
    expect(activeId("/dashboard/students/12")).toBe("students");
    expect(activeId("/dashboard/exams/print")).toBe("exams");
    expect(activeId("/dashboard/settings")).toBe("settings");
    expect(activeId("/dashboard/settings/academic-years")).toBe("settings");
  });
  it("returns '' off the dashboard", () => {
    expect(activeId("/login")).toBe("");
  });
});

describe("visibleGroups", () => {
  it("drops items and then empty groups the account may not open", () => {
    const groups = visibleGroups(["home", "attendance"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["home"], ["attendance"]]);
  });
  it("never includes settings; the rail pins it separately", () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain(SETTINGS.id);
    expect(ids).not.toContain("rollover");
  });
});

it("mobile bar has five items, all of which exist", () => {
  const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
  expect(MOBILE_IDS).toHaveLength(5);
  for (const id of MOBILE_IDS) expect(ids).toContain(id);
});
