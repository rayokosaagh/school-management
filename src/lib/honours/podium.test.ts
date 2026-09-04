import { describe, expect, it } from "vitest";
import type { HonoursStudent } from "./honours";
import { podiumStudents, rankedListRows } from "./podium";

// Builds a section of `n` students, ranked 1..n by roll number, with one more
// unranked student appended (position null) unless `unranked` is 0. Mirrors
// the order honours.ts already returns: ranked first in position order, then
// the unranked by roll.
function section(rankedCount: number, unrankedCount = 0): HonoursStudent[] {
  const ranked: HonoursStudent[] = Array.from({ length: rankedCount }, (_, i) => ({
    studentId: i + 1,
    fullName: `Ranked ${i + 1}`,
    fullNameNp: null,
    photoId: null,
    rollNo: i + 1,
    pillars: { exams: 80, attendance: 90, conduct: 80, activities: 20 },
    overall: 100 - i,
    position: i + 1,
  }));
  const unranked: HonoursStudent[] = Array.from({ length: unrankedCount }, (_, i) => ({
    studentId: rankedCount + i + 1,
    fullName: `Unranked ${i + 1}`,
    fullNameNp: null,
    photoId: null,
    rollNo: rankedCount + i + 1,
    pillars: { exams: null, attendance: 90, conduct: 80, activities: 20 },
    overall: null,
    position: null,
  }));
  return [...ranked, ...unranked];
}

describe("podiumStudents", () => {
  it("takes the top three, ignoring anything past them", () => {
    const s = section(12);
    const top = podiumStudents(s);
    expect(top.map((x) => x.fullName)).toEqual(["Ranked 1", "Ranked 2", "Ranked 3"]);
  });

  it("leaves later slots empty for a section with fewer than three ranked students", () => {
    expect(podiumStudents(section(2)).map((x) => x.fullName)).toEqual(["Ranked 1", "Ranked 2"]);
    expect(podiumStudents(section(0)).length).toBe(0);
    expect(podiumStudents(section(0, 5)).length).toBe(0);
  });

  it("never changes when called with a search-filtered subset — proving the caller must not pass one", () => {
    const s = section(12);
    // A search that happens to match only the 12th-placed student — the
    // reported bug promoted her onto the podium when this filtered array
    // was passed to it instead of the full section.
    const searchedTo12th = s.filter((x) => x.fullName === "Ranked 12");
    expect(podiumStudents(searchedTo12th).map((x) => x.fullName)).toEqual(["Ranked 12"]);
    // The real podium, from the untouched section, is unaffected by that search.
    expect(podiumStudents(s).map((x) => x.fullName)).toEqual(["Ranked 1", "Ranked 2", "Ranked 3"]);
  });
});

describe("rankedListRows", () => {
  it("with an empty query, lists everyone past third place, then the unranked", () => {
    const s = section(5, 2);
    const { ranked, waiting } = rankedListRows(s, "");
    expect(ranked.map((x) => x.fullName)).toEqual(["Ranked 4", "Ranked 5"]);
    expect(waiting.map((x) => x.fullName)).toEqual(["Unranked 1", "Unranked 2"]);
  });

  it("surfaces a low-ranked match without it ever reaching the podium", () => {
    const s = section(12);
    const { ranked } = rankedListRows(s, "ranked 12");
    expect(ranked.map((x) => x.fullName)).toEqual(["Ranked 12"]);
    expect(podiumStudents(s).map((x) => x.fullName)).toEqual(["Ranked 1", "Ranked 2", "Ranked 3"]);
  });

  it("surfaces a match among only the unranked", () => {
    const s = section(3, 4);
    const { ranked, waiting } = rankedListRows(s, "unranked 3");
    expect(ranked.length).toBe(0);
    expect(waiting.map((x) => x.fullName)).toEqual(["Unranked 3"]);
  });

  it("a section with fewer than three ranked students has nothing left to list as 'ranked'", () => {
    const s = section(2, 1);
    const { ranked, waiting } = rankedListRows(s, "");
    expect(ranked.length).toBe(0);
    expect(waiting.map((x) => x.fullName)).toEqual(["Unranked 1"]);
  });

  it("matches case-insensitively and against the Nepali name too", () => {
    // Four ranked students so the fourth — the one being searched for — is
    // past the podium's first three and lands in the "ranked" list, not
    // sliced away with them.
    const s: HonoursStudent[] = [
      ...section(3),
      {
        studentId: 4,
        fullName: "Anita Rai",
        fullNameNp: "अनिता राई",
        photoId: null,
        rollNo: 4,
        pillars: { exams: 80, attendance: 90, conduct: 80, activities: 20 },
        overall: 90,
        position: 4,
      },
    ];
    expect(rankedListRows(s, "ANITA").ranked).toHaveLength(1);
    expect(rankedListRows(s, "राई").ranked).toHaveLength(1);
    expect(rankedListRows(s, "nobody").ranked).toHaveLength(0);
  });
});
