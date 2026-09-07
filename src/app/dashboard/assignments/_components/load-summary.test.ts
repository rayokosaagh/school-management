import { describe, expect, it } from "vitest";
import { summarizeLoad } from "./load-summary";
import type { TeachingRow } from "./teaching-workspace";

const staff = [{ id: 1, fullName: "Asha Rai", photoId: 42 }, { id: 2, fullName: "Asha Rai", photoId: null }, { id: 3, fullName: "Ram Shah", photoId: null }];
const rows: TeachingRow[] = [
  { sectionId: 1, offeringId: 10, sectionLabel: "Class 1 A", subjectName: "Math", tone: 2, hasPractical: false, staffId: 1 },
  { sectionId: 2, offeringId: 10, sectionLabel: "Class 1 B", subjectName: "Math", tone: 2, hasPractical: false, staffId: 1 },
  { sectionId: 1, offeringId: 11, sectionLabel: "Class 1 A", subjectName: "English", tone: 3, hasPractical: false, staffId: 1 },
  { sectionId: 2, offeringId: 11, sectionLabel: "Class 1 B", subjectName: "English", tone: 3, hasPractical: false, staffId: null },
];

describe("teacher load overview", () => {
  it("distinguishes assignments from unique subjects and classes", () => {
    const result = summarizeLoad(rows, staff, {});
    expect(result.unassigned).toBe(1);
    expect(result.people[0].assignments).toHaveLength(3);
    expect(result.people[0].classCount).toBe(2);
    expect(result.people[0].subjects.map((subject) => [subject.name, subject.rows.length])).toEqual([["Math", 2], ["English", 1]]);
  });

  it("keeps unassigned staff and people with the same name separate", () => {
    const result = summarizeLoad(rows, staff, {});
    expect(result.people.map((person) => [person.id, person.assignments.length])).toEqual([[1, 3], [2, 0], [3, 0]]);
  });

  it("reflects optimistic transfers and clearing, then returns to saved assignments", () => {
    const result = summarizeLoad(rows, staff, { "1:10": "2", "1:11": "", "2:11": "3" });
    expect(result.unassigned).toBe(1);
    expect(result.people.map((person) => person.assignments.length)).toEqual([1, 1, 1]);
    expect(summarizeLoad(rows, staff, {}).people.map((person) => person.assignments.length)).toEqual([3, 0, 0]);
  });

  it("handles an academic year with no slots", () => {
    const result = summarizeLoad([], staff, {});
    expect(result.unassigned).toBe(0);
    expect(result.people.every((person) => person.classCount === 0 && person.subjects.length === 0)).toBe(true);
  });
});
