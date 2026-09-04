import { describe, expect, it } from "vitest";

import { validateGradeOrder } from "./structure";

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
