import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ previewRollover: vi.fn(), runRollover: vi.fn(), addTargetYear: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useActionToast: vi.fn() }));
vi.mock("@/components/ui/page-frame", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => children;
  return { PageFrame: Object.assign(Wrapper, { Toolbar: Wrapper, Body: Wrapper }) };
});
vi.mock("./year-step", () => ({
  YearStep: ({ targetYearId }: { targetYearId: number | null }) => `Selected year: ${targetYearId ?? "none"}`,
}));
import { RolloverWorkspace } from "./rollover-workspace";
import RolloverPage from "../page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { redirect } from "next/navigation";

describe("settings rollover entry", () => {
  const sourceYear = { id: 1, nameBS: "2083" };
  const year = (id: number, nameBS: string) => ({ id, nameBS, sections: 0, enrollments: 0 });
  it("redirects old bookmarks into Settings", () => {
    RolloverPage();
    expect(redirect).toHaveBeenCalledWith("/dashboard/settings/academic-years");
  });
  it("does not preselect a past year or an arbitrary future year", () => {
    const html = renderToStaticMarkup(createElement(RolloverWorkspace, {
      sourceYear, years: [year(3, "2086"), year(2, "2082")], examTerms: [],
    }));
    expect(html).toContain("Selected year: none");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Prepare year");
    expect(html).toContain("Review students");
    expect(html).toContain("Confirm &amp; activate");
    expect(html).not.toContain('role="tab"');
  });
  it("prefers the immediately following year when it exists", () => {
    const html = renderToStaticMarkup(createElement(RolloverWorkspace, {
      sourceYear, years: [year(3, "2086"), year(2, "2084")], examTerms: [],
    }));
    expect(html).toContain("Selected year: 2");
  });
});
