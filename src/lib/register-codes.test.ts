import { expect, it } from "vitest";
import { designationCode, sectionCode } from "./register-codes";

it("codes a section by its grade number, or by initials when it has none", () => {
  expect(sectionCode("Class 10", "B")).toBe("10B");
  expect(sectionCode("Senior Kindergarten", "A")).toBe("SKA");
  expect(sectionCode("Nursery", "A")).toBe("NA");
});

it("codes a designation by its initials, with a placeholder when it is blank", () => {
  expect(designationCode("Vice Principal")).toBe("VP");
  expect(designationCode("Teacher")).toBe("T");
  expect(designationCode("")).toBe("?");
});
