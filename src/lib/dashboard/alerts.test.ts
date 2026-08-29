import { describe, expect, it } from "vitest";
import { dueItems } from "./alerts";

const empty = {
  today: { date: new Date(), missingAttendance: [], sectionsTotal: 14, absent: 0 },
  gaps: { sectionsWithoutClassTeacher: [], unassignedSlots: 0, unpublishedExams: 0, examsTotal: 2 },
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
      { key: "attendance", label: "2 sections still need roll call", href: "/dashboard/attendance", tone: "warn" },
    ]);
  });

  it("uses singular wording and lists every kind of gap", () => {
    const items = dueItems({
      today: { ...empty.today, missingAttendance: [{ id: 1, label: "Class 1 A" }] },
      gaps: {
        sectionsWithoutClassTeacher: [{ id: 3, label: "Class 3 A" }],
        unassignedSlots: 4,
        unpublishedExams: 1,
        examsTotal: 2,
      },
    });
    expect(items.map((i) => i.label)).toEqual([
      "1 section still needs roll call",
      "1 exam not published yet",
      "Class 3 A has no class teacher",
      "4 subject slots have no teacher",
    ]);
    expect(items.map((i) => i.href)).toEqual([
      "/dashboard/attendance",
      "/dashboard/exams",
      "/dashboard/classes",
      "/dashboard/assignments",
    ]);
  });
});
