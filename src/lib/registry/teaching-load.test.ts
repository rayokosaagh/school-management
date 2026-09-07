import { describe, expect, it } from "vitest";
import { groupTeachingLoad, type LoadAssignment } from "./teaching-load";

const YEAR = { id: 1, name: "2083" };

function assignment(over: Partial<LoadAssignment> = {}): LoadAssignment {
  return {
    yearId: YEAR.id,
    yearName: YEAR.name,
    sectionId: 1,
    sectionName: "A",
    gradeName: "Class 1",
    gradeOrder: 3,
    subject: "English",
    ...over,
  };
}

describe("grouping a teaching load", () => {
  it("states a subject once and lists the classes it is taught to", () => {
    // The case this exists for: one subject across many classes was one line
    // per class, with the subject name repeated down the column.
    const load = groupTeachingLoad(
      [
        assignment({ sectionId: 1, gradeName: "Class 1", gradeOrder: 3 }),
        assignment({ sectionId: 2, gradeName: "Class 2", gradeOrder: 4 }),
        assignment({ sectionId: 3, gradeName: "Class 3", gradeOrder: 5 }),
      ],
      YEAR.id,
    );
    expect(load).toHaveLength(1);
    expect(load[0].subjects).toHaveLength(1);
    expect(load[0].subjects[0].subject).toBe("English");
    expect(load[0].subjects[0].classes.map((c) => c.code)).toEqual(["1A", "2A", "3A"]);
    expect(load[0].subjectCount).toBe(1);
    expect(load[0].classCount).toBe(3);
  });

  it("orders classes by grade, not by the look of their labels", () => {
    const load = groupTeachingLoad(
      [
        assignment({ sectionId: 10, gradeName: "Class 10", gradeOrder: 12 }),
        assignment({ sectionId: 2, gradeName: "Class 2", gradeOrder: 4 }),
        assignment({ sectionId: 1, gradeName: "Kindergarten", gradeOrder: 1 }),
      ],
      YEAR.id,
    );
    // Sorting the labels would put "Class 10 A" before "Class 2 A".
    expect(load[0].subjects[0].classes.map((c) => c.code)).toEqual(["KA", "2A", "10A"]);
  });

  it("counts a class once when it takes two subjects from the same teacher", () => {
    const load = groupTeachingLoad(
      [
        assignment({ sectionId: 1, subject: "English" }),
        assignment({ sectionId: 1, subject: "Nepali" }),
      ],
      YEAR.id,
    );
    expect(load[0].subjectCount).toBe(2);
    expect(load[0].classCount).toBe(1);
  });

  it("collapses one class reaching a subject through two offerings", () => {
    const load = groupTeachingLoad(
      [assignment({ sectionId: 1 }), assignment({ sectionId: 1 })],
      YEAR.id,
    );
    expect(load[0].subjects[0].classes).toHaveLength(1);
    expect(load[0].classCount).toBe(1);
  });

  it("leads with the subject carried across the most classes", () => {
    const load = groupTeachingLoad(
      [
        assignment({ sectionId: 1, subject: "Nepali" }),
        assignment({ sectionId: 1, subject: "English" }),
        assignment({ sectionId: 2, subject: "English", gradeName: "Class 2", gradeOrder: 4 }),
      ],
      YEAR.id,
    );
    expect(load[0].subjects.map((s) => s.subject)).toEqual(["English", "Nepali"]);
  });

  it("puts the selected year first and the rest newest-first", () => {
    const load = groupTeachingLoad(
      [
        assignment({ yearId: 2, yearName: "2081" }),
        assignment({ yearId: 3, yearName: "2084" }),
        assignment({ yearId: 1, yearName: "2083" }),
      ],
      1,
    );
    expect(load.map((y) => y.year)).toEqual(["2083", "2084", "2081"]);
  });

  it("has nothing to show for a staff member who teaches nothing", () => {
    expect(groupTeachingLoad([], YEAR.id)).toEqual([]);
  });
});
