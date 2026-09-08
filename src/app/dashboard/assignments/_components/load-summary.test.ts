import { describe, expect, it } from "vitest";
import { summarizeLoad } from "./load-summary";
import type { TeachingRow } from "./teaching-workspace";

const person = (id: number, fullName: string, photoId: number | null, over: object = {}) =>
  ({ id, fullName, fullNameNp: null, photoId, designation: "Teacher", isActive: true, ...over });
const staff = [person(1, "Asha Rai", 42), person(2, "Asha Rai", null), person(3, "Ram Shah", null)];
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

describe("slots held by somebody who has been deactivated", () => {
  // Deactivating does not release the classes somebody holds, so their slots
  // are neither unassigned nor on an active card. Before they were listed,
  // the header counted them as assigned and no card accounted for them.
  const held: TeachingRow[] = [
    { sectionId: 1, offeringId: 10, sectionLabel: "Class 1 A", subjectName: "Math", tone: 2, hasPractical: false, staffId: 9 },
    { sectionId: 2, offeringId: 10, sectionLabel: "Class 1 B", subjectName: "Math", tone: 2, hasPractical: false, staffId: null },
  ];

  it("still adds up when the holder is listed", () => {
    const withFormer = [...staff, person(9, "Gone Teacher", null, { isActive: false })];
    const result = summarizeLoad(held, withFormer, {});
    const onCards = result.people.reduce((sum, p) => sum + p.assignments.length, 0);
    expect(held.length - result.unassigned).toBe(onCards);
  });

  it("keeps the held class on the deactivated person's own card", () => {
    const withFormer = [...staff, person(9, "Gone Teacher", null, { isActive: false })];
    const result = summarizeLoad(held, withFormer, {});
    const gone = result.people.find((p) => p.id === 9);
    expect(gone?.assignments).toHaveLength(1);
    expect(gone?.isActive).toBe(false);
  });

  it("loses the slot when the holder is left out, which is what was wrong", () => {
    const result = summarizeLoad(held, staff, {});
    const onCards = result.people.reduce((sum, p) => sum + p.assignments.length, 0);
    // One slot counted as assigned by the header, shown on no card at all.
    expect(held.length - result.unassigned).toBe(1);
    expect(onCards).toBe(0);
  });
});
