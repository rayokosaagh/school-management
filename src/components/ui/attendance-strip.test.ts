import { expect, it } from "vitest";
import { describeStrip, stripPercent } from "./attendance-strip";

it("summarises a strip in words for assistive tech", () => {
  expect(describeStrip(["present", "present", "absent", "late", "none"])).toBe(
    "Last 5 days: 2 present, 1 absent, 1 late, 1 not taken",
  );
  expect(describeStrip([])).toBe("No attendance recorded");
});

it("rates a strip on the days that were actually taken", () => {
  // Late counts as attending; the untaken day is not held against the student.
  expect(stripPercent(["present", "late", "absent", "none"])).toBe(67);
  expect(stripPercent(["none"])).toBe(null);
});
