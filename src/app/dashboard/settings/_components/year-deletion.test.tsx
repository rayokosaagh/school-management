import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./delete-year-dialog", () => ({ DeleteYearDialog: () => null }));
import { YearDeletion } from "./year-deletion";

describe("Settings year deletion", () => {
  it("offers review for inactive years but disables deleting the current year", () => {
    const html = renderToStaticMarkup(createElement(YearDeletion, { years: [
      { id: 1, nameBS: "2083", span: "Current date range", isCurrent: true },
      { id: 2, nameBS: "2084", span: "Upcoming date range", isCurrent: false },
    ] }));
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain("disabled");
    expect(buttons[0]).toContain("academic year 2083");
    expect(buttons[1]).not.toContain('disabled=""');
    expect(buttons[1]).toContain("academic year 2084");
    expect(html).toContain("enabled by default");
    expect(html).toContain("does not automatically reset");
  });
  it("handles an empty year list without a delete control", () => {
    const html = renderToStaticMarkup(createElement(YearDeletion, { years: [] }));
    expect(html).toContain("No academic years to delete");
    expect(html).not.toContain("<button");
  });
});
