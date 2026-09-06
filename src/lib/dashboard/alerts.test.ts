import { describe, expect, it } from "vitest";
import { dueItems } from "./alerts";

const allAccess = {
  records: true, attendance: true, registry: true, marks: true,
  manageExams: true, fees: true, settings: true, timetable: true, announce: true,
};

const empty = {
  access: allAccess,
  today: { date: new Date(), missingAttendance: [], sectionsTotal: 14, absent: 0 },
  gaps: { sectionsWithoutClassTeacher: [], unassignedSlots: 0, unpublishedExams: 0, examsTotal: 2, unbilledMonths: 0 },
};

const everything = {
  access: allAccess,
  today: { ...empty.today, missingAttendance: [{ id: 1, label: "Class 1 A" }] },
  gaps: {
    sectionsWithoutClassTeacher: [{ id: 3, label: "Class 3 A" }],
    unassignedSlots: 4,
    unpublishedExams: 1,
    examsTotal: 2,
    unbilledMonths: 2,
  },
};

describe("dueItems", () => {
  it("is empty when nothing is due", () => {
    expect(dueItems(empty)).toEqual([]);
  });

  it("counts sections still to mark and links to roll call", () => {
    const items = dueItems({
      ...empty,
      today: { ...empty.today, missingAttendance: [{ id: 1, label: "Class 1 A" }, { id: 2, label: "Class 2 A" }] },
    });
    expect(items).toEqual([
      {
        key: "attendance",
        label: "2 sections still need roll call",
        detail: "Registers still waiting to be marked today.",
        count: 2,
        href: "/dashboard/attendance",
        tone: "warn",
      },
    ]);
  });

  it("uses singular wording and lists every kind of gap", () => {
    expect(dueItems(everything).map((i) => i.label)).toEqual([
      "1 section still needs roll call",
      "1 exam not published yet",
      "Class 3 A has no class teacher",
      "4 subject slots have no teacher",
      "2 months not yet billed",
    ]);
    expect(dueItems(everything).map((i) => i.href)).toEqual([
      "/dashboard/attendance",
      "/dashboard/exams",
      "/dashboard/classes",
      "/dashboard/assignments",
      "/dashboard/fees",
    ]);
  });

  // The top bar showed no fee row at all before this list became the only one:
  // the Overview panel had learnt about unbilled months and the alert list
  // never did.
  it("reports unbilled fee months", () => {
    const items = dueItems({ ...empty, gaps: { ...empty.gaps, unbilledMonths: 1 } });
    expect(items).toEqual([
      {
        key: "fees",
        label: "1 month not yet billed",
        detail: "Months that have started with no bill sent.",
        count: 1,
        href: "/dashboard/fees",
        tone: "warn",
      },
    ]);
  });

  // An alert is a shortcut into a page, so it is worth no more than the
  // permission to open that page. Both callers relied on this; only one of
  // them used to do it.
  it("drops what the reader may not act on", () => {
    const items = dueItems({
      ...everything,
      access: { ...allAccess, attendance: false, registry: false, manageExams: false, fees: false },
    });
    expect(items).toEqual([]);
  });

  it("keeps only the gaps a teacher can close", () => {
    const items = dueItems({
      ...everything,
      access: { ...allAccess, registry: false, manageExams: false, fees: false },
    });
    expect(items.map((i) => i.key)).toEqual(["attendance"]);
  });

  it("counts each unled section once rather than as one lump", () => {
    const items = dueItems({
      ...empty,
      gaps: {
        ...empty.gaps,
        sectionsWithoutClassTeacher: [
          { id: 3, label: "Class 3 A" },
          { id: 4, label: "Class 4 B" },
        ],
      },
    });
    expect(items.map((i) => [i.key, i.count])).toEqual([
      ["class-teacher-3", 1],
      ["class-teacher-4", 1],
    ]);
  });
});
