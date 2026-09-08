import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("./transport-panel", () => ({ TransportPanel: () => "Transportation table" }));
vi.mock("../student-fee-actions", () => ({ addStudentFee: vi.fn(), billStudentFee: vi.fn(), saveStudentFee: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToastedActionState: () => [{}, () => {}, false] }));
import { ServicesPanel } from "./services-panel";
import { PlanEditor, ServicePriceSetup } from "./student-fees-panel";

const PLAN = {
  id: 7,
  name: "Library",
  frequency: "MONTHLY" as const,
  amount: 300,
  isActive: true,
  selectedIds: [11],
  assignments: [{ id: 1, enrollmentId: 11, isActive: true, billedMonths: [1] }],
};
const STUDENTS = [{ id: 11, name: "Sita Rai", nameNp: "सीता राई", admissionNo: "0012", section: "Grade 4 A" }];
const MONTHS = [{ month: 1, started: true }, { month: 2, started: false }];
const EMPTY_PANEL = {
  academicYearId: 1,
  yearLabel: "2083",
  data: { plans: [], heads: [], months: [] },
  transport: { enrollments: [], registrations: [], months: [] },
};

describe("service creation entry point", () => {
  it("does not show an add-service strip in Services", () => {
    const html = renderToStaticMarkup(createElement(ServicesPanel, EMPTY_PANEL));
    expect(html).toContain("Transportation table");
    expect(html).not.toContain("Add a service fee structure");
    expect(html).not.toContain("Create service fee structure");
    expect(html).not.toContain('name="amount"');
  });

  it("lets an existing Manage fee types service receive its first price without another creation form", () => {
    const html = renderToStaticMarkup(createElement(ServicePriceSetup, {
      academicYearId: 1,
      yearLabel: "2083",
      head: { id: 4, name: "Library", frequency: "MONTHLY", billingScope: "STUDENT" },
      onBusy: () => {},
    }));
    expect(html).toContain("Save service price");
    expect(html).toContain('name="name" value="Library"');
    expect(html).toContain('name="frequency" value="MONTHLY"');
    expect(html).toContain('name="convertClassFee" value="false"');
    expect(html).toContain('name="amount"');
    expect(html).not.toContain("Fee name");
    expect(html).not.toContain("<summary");
  });
});

describe("the service rail", () => {
  it("lists the services the school actually has, with their registrations", () => {
    const html = renderToStaticMarkup(createElement(ServicesPanel, {
      academicYearId: 1,
      yearLabel: "2083",
      data: {
        plans: [PLAN],
        // Priced already, so it must not also appear as needing setup.
        heads: [
          { id: 4, name: "Library", frequency: "MONTHLY", billingScope: "STUDENT" },
          { id: 9, name: "Hostel", frequency: "MONTHLY", billingScope: "STUDENT" },
          // Class-wide fees are priced per class, not registered per pupil.
          { id: 2, name: "Admission", frequency: "ONE_TIME", billingScope: "CLASS" },
        ],
        months: MONTHS,
      },
      transport: {
        enrollments: STUDENTS,
        registrations: [{ id: 1, enrollmentId: 11, name: "Sita Rai", nameNp: "सीता राई", admissionNo: "0012", section: "Grade 4 A", pickupLocation: "North stop", monthlyAmount: 900, startMonth: 1, isActive: true, billedMonths: [] }],
        months: MONTHS,
      },
    }));

    // Transport always, then the priced plans, then anything still unpriced.
    expect(html).toContain("Transportation");
    expect(html).toContain("Library");
    expect(html).toContain("Hostel");
    expect(html).toContain("Needs a price");
    // A class-wide fee is not a service and has no place in this list.
    expect(html).not.toContain("Admission");
    // Library is priced, so it is named once — as a plan, not as a fee type
    // still waiting for a price.
    expect(html.split("Library").length - 1).toBeGreaterThan(0);
    expect(html).toContain("3 services");
  });

  it("puts a plan's billing form beside its roster, not inside its form", () => {
    const html = renderToStaticMarkup(createElement(PlanEditor, {
      academicYearId: 1,
      yearLabel: "2083",
      plan: PLAN,
      students: STUDENTS,
      months: MONTHS,
      onBusy: () => {},
    }));

    // The transportation panel's layout, now shared: register on the left,
    // issue on the right.
    expect(html).toContain("Save price and students");
    expect(html).toContain("Issue student fee bills");
    expect(html).toContain("Register a student");

    // Nested forms are invalid HTML, and the roster's hidden student ids have
    // to post with the price — so the two forms must be siblings.
    const opened = html.indexOf("<form");
    const closed = html.indexOf("</form>", opened);
    expect(opened).toBeGreaterThanOrEqual(0);
    // Sliced past the opening tag itself, so what is searched is the form's
    // own content.
    expect(html.slice(opened + "<form".length, closed)).not.toContain("<form");
    // And there really are two of them, so the check is not passing by there
    // being nothing to nest.
    expect(html.split("<form").length - 1).toBe(2);
  });
});
