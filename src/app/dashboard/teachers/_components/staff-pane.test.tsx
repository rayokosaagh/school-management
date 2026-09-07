import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

// Both pull in server actions and are only rendered in the edit branch.
vi.mock("./staff-detail", () => ({ StaffDetail: () => "Edit form" }));
vi.mock("./photo-form", () => ({ StaffPhotoForm: () => "Photo form" }));

import { StaffPane } from "./staff-pane";
import type { StaffSummary } from "@/lib/registry/staff";
import type { StaffRow } from "./staff-detail";

const LADDER = [
  { name: "Kindergarten", code: "K" },
  { name: "Class 1", code: "1" },
  { name: "Class 2", code: "2" },
];

const ROW: StaffRow = {
  id: 40, firstName: "Deepak", middleName: null, lastName: "Karki",
  fullName: "Deepak Karki", fullNameNp: null, photoId: null, phone: "9801000008",
  designation: "Accountant", joinedOnBs: "2083-01-01", isActive: true,
  sectionsLed: 0, assignments: 0,
};

function summary(over: Partial<StaffSummary> = {}): StaffSummary {
  return {
    staffId: 40, fullName: "Deepak Karki", fullNameNp: null, photoId: null,
    phone: "9801000008", designation: "Accountant", joinedOnBs: "2083-01-01",
    isActive: true, account: null, sectionsLed: [], load: [], rollCallsTaken: 0,
    ...over,
  };
}

function render(account: StaffSummary["account"], canManageAccounts: boolean) {
  return renderToStaticMarkup(
    createElement(StaffPane, { summary: summary({ account }), row: ROW, canManageAccounts, yearLabel: "2083", ladder: LADDER }),
  );
}

function pane(over: Partial<StaffSummary>) {
  return renderToStaticMarkup(
    createElement(StaffPane, { summary: summary(over), row: ROW, canManageAccounts: false, yearLabel: "2083", ladder: LADDER }),
  );
}

function year(name: string) {
  return {
    year: name, subjectCount: 1, classCount: 1,
    subjects: [{ subject: "English", classes: [{ code: "1A", label: "Class 1 A", gradeName: "Class 1", gradeOrder: 3 }] }],
  };
}

describe("the staff pane's sign-in shortcut", () => {
  it("offers to set up a sign-in for somebody with no account", () => {
    const html = render(null, true);
    expect(html).toContain("Set up sign-in");
    // Carries the staff id, so Settings opens on the person whose pane it was
    // clicked from rather than an empty form.
    expect(html).toContain("/dashboard/settings?view=privacy&amp;staff=40");
  });

  it("stays out of the way once they already have one", () => {
    const html = render({ username: "dkarki", email: "d@local.com" }, true);
    expect(html).not.toContain("Set up sign-in");
    expect(html).toContain("dkarki");
  });

  it("hides the shortcut from an account that cannot reach Settings", () => {
    // Following it would only bounce them to /dashboard?denied=1. The button is
    // cosmetic either way: addAccount checks the capability again server-side.
    const html = render(null, false);
    expect(html).not.toContain("Set up sign-in");
    expect(html).toContain("No account");
  });
});

describe("the pane leading with the selected year", () => {
  it("shows this year's classes without repeating the year on every line", () => {
    const html = pane({
      sectionsLed: [{ id: 1, label: "Class 2 A", year: "2083" }],
    });
    expect(html).toContain("Class 2 A");
    // The section is already about this year; the suffix was noise.
    expect(html).not.toContain("· 2083");
  });

  it("folds other years away rather than printing them at full weight", () => {
    const html = pane({ load: [year("2083"), year("2084")] });
    // Both years used to be listed in full, which for somebody doing the same
    // job twice running was the same block twice.
    expect(html).toContain("1 other year");
    expect(html.match(/English/g)?.length).toBe(1);
  });

  it("counts several folded years together", () => {
    const html = pane({ load: [year("2083"), year("2084"), year("2082")] });
    expect(html).toContain("2 other years");
  });

  it("says so when somebody taught in other years but not this one", () => {
    const html = pane({ load: [year("2084")] });
    expect(html).toContain("No subjects this year");
    expect(html).toContain("1 other year");
  });

  it("keeps the plain empty state for somebody who has never taught", () => {
    const html = pane({ load: [] });
    expect(html).toContain("No subjects assigned");
    expect(html).not.toContain("other year");
  });
});

describe("the teaching-load reach bar", () => {
  const ladder = [
    { name: "Kindergarten", code: "K" },
    { name: "Class 1", code: "1" },
    { name: "Class 2", code: "2" },
  ];

  function withLoad(classes: { code: string; label: string; gradeName: string; gradeOrder: number }[]) {
    return renderToStaticMarkup(
      createElement(StaffPane, {
        summary: summary({
          load: [{ year: "2083", subjectCount: 1, classCount: classes.length, subjects: [{ subject: "English", classes }] }],
        }),
        row: ROW,
        canManageAccounts: false,
        yearLabel: "2083",
        ladder,
      }),
    );
  }

  it("draws every grade the school runs, not only the ones taught", () => {
    // The untaught rungs are the point: without them there is no shape to see.
    const html = withLoad([{ code: "1A", label: "Class 1 A", gradeName: "Class 1", gradeOrder: 3 }]);
    expect(html).toContain("Kindergarten — not taught");
    expect(html).toContain("Class 2 — not taught");
    expect(html).toContain("Class 1 A");
  });

  it("reports reach against the whole ladder", () => {
    const html = withLoad([{ code: "1A", label: "Class 1 A", gradeName: "Class 1", gradeOrder: 3 }]);
    expect(html).toContain("1 of 3 grades");
  });

  it("counts a grade once when two of its sections are taught", () => {
    const html = withLoad([
      { code: "1A", label: "Class 1 A", gradeName: "Class 1", gradeOrder: 3 },
      { code: "1B", label: "Class 1 B", gradeName: "Class 1", gradeOrder: 3 },
    ]);
    // One grade covered, but two classes — both facts are worth saying.
    expect(html).toContain("1 of 3 grades");
    expect(html).toContain("2 classes");
  });

  it("falls back to class codes when the year has no grades to draw against", () => {
    const html = renderToStaticMarkup(
      createElement(StaffPane, {
        summary: summary({
          load: [{ year: "2083", subjectCount: 1, classCount: 1, subjects: [{ subject: "English", classes: [{ code: "1A", label: "Class 1 A", gradeName: "Class 1", gradeOrder: 3 }] }] }],
        }),
        row: ROW,
        canManageAccounts: false,
        yearLabel: "2083",
        ladder: [],
      }),
    );
    expect(html).toContain("1A");
    expect(html).not.toContain("of 0 grades");
  });
});
