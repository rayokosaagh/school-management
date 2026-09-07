import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeacherLoadView } from "./teacher-load";
import type { TeachingRow } from "./teaching-workspace";

const person = (id: number, fullName: string, over: object = {}) =>
  ({ id, fullName, photoId: null, designation: "Teacher", isActive: true, ...over });

const slot = (staffId: number | null, offeringId = 10): TeachingRow => ({
  sectionId: 1, offeringId, sectionLabel: "Class 1 A", subjectName: "Math",
  tone: 2, hasPractical: false, staffId,
});

function view(rows: TeachingRow[], staff: ReturnType<typeof person>[]) {
  return renderToStaticMarkup(
    createElement(TeacherLoadView, { rows, staff, chosen: {}, onManage: () => {} }),
  );
}

describe("teacher load photos", () => {
  it("renders the saved photo and keeps initials for staff without one", () => {
    const html = renderToStaticMarkup(createElement(TeacherLoadView, {
      rows: [],
      staff: [
        { id: 1, fullName: "Asha Rai", photoId: 42, designation: "Teacher", isActive: true },
        { id: 2, fullName: "Ram Shah", photoId: null, designation: "Teacher", isActive: true },
      ],
      chosen: {},
      onManage: () => {},
    }));
    expect(html).toContain('src="/api/photo/42"');
    expect(html).toContain(">RS</span>");
    expect(html).not.toContain(">AR</span>");
    expect(html).not.toContain("/api/photo/null");
  });
});

describe("telling staff apart", () => {
  it("names each person's role, so two people sharing a name are distinct", () => {
    // The school has two Sita Sharmas — one Principal, one Teacher.
    const html = view([slot(1)], [
      person(1, "Sita Sharma", { designation: "Principal" }),
      person(2, "Sita Sharma"),
    ]);
    expect(html).toContain("Principal");
    expect(html).toContain("Teacher");
  });

  it("names the role of somebody whose title is not Teacher", () => {
    // A Vice Principal carrying classes belongs here, and the card says why
    // the name is not one of the ordinary teachers.
    const html = view([slot(1)], [person(1, "Ramesh Bahadur Thapa", { designation: "Vice Principal" })]);
    expect(html).toContain("Vice Principal");
  });
});

describe("classes left on a deactivated teacher", () => {
  const staff = [person(1, "Active One"), person(9, "Gone Teacher", { isActive: false })];

  it("calls it out above the cards", () => {
    const html = view([slot(9)], staff);
    expect(html).toContain("still assigned to");
    expect(html).toContain("Gone Teacher");
  });

  it("marks the card itself with what it is holding", () => {
    const html = view([slot(9)], staff);
    expect(html).toContain("Deactivated, still holding 1 class");
  });

  it("says nothing when every holder is active", () => {
    const html = view([slot(1)], staff);
    expect(html).not.toContain("still assigned to");
    expect(html).not.toContain("Deactivated, still holding");
  });
});

describe("who belongs in a workload view", () => {
  it("leaves out staff who neither teach nor are titled a teacher", () => {
    const html = view([], [
      person(1, "Hari Gurung"),
      person(2, "Deepak Karki", { designation: "Accountant" }),
    ]);
    expect(html).toContain("Hari Gurung");
    expect(html).not.toContain("Deepak Karki");
  });

  it("keeps senior staff who actually carry classes", () => {
    // The Principal and Vice Principal teach here, so a filter on the word
    // "Teacher" would have hidden real load.
    const html = view([slot(1), slot(2, 11)], [
      person(1, "Sita Sharma", { designation: "Principal" }),
      person(2, "Ramesh Bahadur Thapa", { designation: "Vice Principal" }),
    ]);
    expect(html).toContain("Sita Sharma");
    expect(html).toContain("Ramesh Bahadur Thapa");
  });

  it("keeps a teacher who has been given nothing yet", () => {
    // That is the whole point of the Unassigned bucket.
    const html = view([], [person(1, "New Teacher")]);
    expect(html).toContain("New Teacher");
    expect(html).toContain("No teaching assignments");
  });

  it("never hides somebody holding a class, whatever their title", () => {
    // Dropping them would put the slot back in the gap between the header
    // count and the cards.
    const html = view([slot(2)], [
      person(1, "Hari Gurung"),
      person(2, "Deepak Karki", { designation: "Accountant" }),
    ]);
    expect(html).toContain("Deepak Karki");
  });
});
