import { describe, expect, it } from "vitest";

import { parkingFloor, validateGradeOrder } from "./structure";

describe("validateGradeOrder", () => {
  it("rejects an empty list", () => {
    expect(() => validateGradeOrder([], [1, 2, 3])).toThrow(/empty/i);
  });

  it("rejects a duplicate id", () => {
    expect(() => validateGradeOrder([1, 2, 2], [1, 2])).toThrow(/more than once/i);
  });

  it("rejects an id that is not an existing grade", () => {
    expect(() => validateGradeOrder([1, 2, 99], [1, 2])).toThrow(/does not exist/i);
  });

  it("rejects a list that omits an existing grade", () => {
    expect(() => validateGradeOrder([1, 2], [1, 2, 3])).toThrow(/missing/i);
  });

  it("accepts a list that is a full reordering of the existing grades", () => {
    expect(() => validateGradeOrder([3, 1, 2], [1, 2, 3])).not.toThrow();
  });
});

describe("parkingFloor", () => {
  it("sits below a zero-based order list", () => {
    expect(parkingFloor(0)).toBe(-1);
  });

  // The regression: grades left at 3,4,5 by earlier deletions used to park at
  // 2,1,0, which are exactly the values the rewrite then writes — so a still
  // parked row collided and the whole renumber threw.
  it("stays below zero even when the lowest order is already positive", () => {
    expect(parkingFloor(3)).toBe(-1);
    expect(parkingFloor(99)).toBe(-1);
  });

  it("goes below an already negative minimum", () => {
    expect(parkingFloor(-5)).toBe(-6);
  });

  it("treats no grades at all as a zero baseline", () => {
    expect(parkingFloor(null)).toBe(-1);
  });
});
