import { describe, expect, it } from "vitest";
import { matchScore, rank } from "./global";

describe("matchScore", () => {
  it("scores a field that starts with the query ahead of one that merely holds it", () => {
    expect(matchScore("ram", ["Ram Bahadur"])).toBe(0);
    expect(matchScore("bahadur", ["Ram Bahadur"])).toBe(1);
  });

  it("takes the best score across the fields it is given", () => {
    // The name only contains it; the admission number leads with it.
    expect(matchScore("20", ["Sita Rai", "2083-014"])).toBe(0);
  });

  it("ignores case and the space either side of the query", () => {
    expect(matchScore("  RAM ", ["ram bahadur"])).toBe(0);
    expect(matchScore("RAI", ["Sita Rai"])).toBe(1);
  });

  it("passes over fields that are not filled in", () => {
    expect(matchScore("rai", [null, undefined, "Sita Rai"])).toBe(1);
    expect(matchScore("rai", [null, undefined])).toBeNull();
  });

  it("has no score when nothing matches", () => {
    expect(matchScore("gurung", ["Ram Bahadur", "2083-014"])).toBeNull();
  });

  it("has no score for a query that is only space", () => {
    expect(matchScore("   ", ["Ram Bahadur"])).toBeNull();
  });
});

describe("rank", () => {
  const names = (items: { name: string }[]) => items.map((i) => i.name);
  const byName = (i: { name: string }) => [i.name];

  it("puts every prefix match before any contains match", () => {
    const rows = [{ name: "Bishal Rai" }, { name: "Rai Kumar" }, { name: "Sita Rai" }];
    expect(names(rank(rows, "rai", byName))).toEqual(["Rai Kumar", "Bishal Rai", "Sita Rai"]);
  });

  it("keeps the order it was given among equally good matches", () => {
    const rows = [{ name: "Ram Two" }, { name: "Ram One" }];
    expect(names(rank(rows, "ram", byName))).toEqual(["Ram Two", "Ram One"]);
  });

  it("leaves out what nothing matched", () => {
    const rows = [{ name: "Ram Bahadur" }, { name: "Sita Rai" }];
    expect(names(rank(rows, "ram", byName))).toEqual(["Ram Bahadur"]);
  });

  it("holds a group to five, keeping the best", () => {
    const rows = [
      { name: "Bishal Rai" },
      { name: "Rai A" },
      { name: "Rai B" },
      { name: "Rai C" },
      { name: "Rai D" },
      { name: "Rai E" },
    ];
    expect(names(rank(rows, "rai", byName))).toEqual(["Rai A", "Rai B", "Rai C", "Rai D", "Rai E"]);
  });

  it("takes a smaller cap when one is asked for", () => {
    const rows = [{ name: "Rai A" }, { name: "Rai B" }, { name: "Rai C" }];
    expect(names(rank(rows, "rai", byName, 2))).toEqual(["Rai A", "Rai B"]);
  });

  it("finds nothing for a blank query", () => {
    expect(rank([{ name: "Ram Bahadur" }], "  ", byName)).toEqual([]);
  });
});
