import { expect, it } from "vitest";
import { describeStrip } from "./attendance-strip";

it("summarises a strip in words for assistive tech", () => {
  expect(describeStrip(["present", "present", "absent", "late", "none"])).toBe(
    "Last 5 days: 2 present, 1 absent, 1 late, 1 not taken",
  );
  expect(describeStrip([])).toBe("No attendance recorded");
});
