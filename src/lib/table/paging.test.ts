import { describe, expect, it } from "vitest";
import { clampPageIndex } from "./paging";

describe("clampPageIndex", () => {
  it("leaves an index that is in range alone", () => {
    expect(clampPageIndex(0, 100, 25)).toBe(0);
    expect(clampPageIndex(2, 100, 25)).toBe(2);
    expect(clampPageIndex(3, 100, 25)).toBe(3);
  });

  it("clamps an index past the end onto the last page", () => {
    // 100 rows at 25 a page is four pages, so 3 is the last index.
    expect(clampPageIndex(9, 100, 25)).toBe(3);
    // A partial last page still counts.
    expect(clampPageIndex(9, 101, 25)).toBe(4);
  });

  it("returns 0 when there is nothing to page through", () => {
    expect(clampPageIndex(0, 0, 25)).toBe(0);
    expect(clampPageIndex(7, 0, 25)).toBe(0);
  });

  it("never returns a negative index", () => {
    expect(clampPageIndex(-3, 100, 25)).toBe(0);
  });
});
