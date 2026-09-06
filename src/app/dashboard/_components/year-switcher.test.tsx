import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { yearDateStatus, type YearDateStatus } from "@/lib/date/year-status";

vi.mock("../actions", () => ({ switchAcademicYear: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToastedActionState: () => [{}, vi.fn(), false] }));
import { YearSwitcher } from "./year-switcher";

describe("academic year date status", () => {
  const year = { startsOn: new Date("2027-04-14T00:00:00Z"), endsOn: new Date("2028-04-13T00:00:00Z") };
  it.each([
    ["2027-04-13", "upcoming"],
    ["2027-04-14", "present"],
    ["2027-09-01", "present"],
    ["2028-04-13", "present"],
    ["2028-04-14", "past"],
  ])("classifies %s as %s with inclusive endpoints", (date, expected) => {
    expect(yearDateStatus(new Date(`${date}T00:00:00Z`), year)).toBe(expected);
  });
  it("has no date status when no year is selected", () => {
    expect(yearDateStatus(year.startsOn, null)).toBeNull();
  });
  it.each<YearDateStatus | null>(["upcoming", "past", "present", null])("renders the correct badge for %s", (status) => {
    const html = renderToStaticMarkup(createElement(YearSwitcher, {
      years: [{ id: 1, nameBS: "2084", sections: 1 }], currentId: 1, span: null,
      yearStatus: status, canManageRegistry: true,
    }));
    expect(html.includes("Upcoming year")).toBe(status === "upcoming");
    expect(html.includes("Past year")).toBe(status === "past");
  });
});
