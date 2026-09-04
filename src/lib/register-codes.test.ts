import { expect, it } from "vitest";
import { designationCode, initialRegisterTab, sectionCode } from "./register-codes";

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

it("lands a deep link on its own row's tab, and everything else on the broadest view", () => {
  expect(initialRegisterTab(12, "all")).toBe("12");
  expect(initialRegisterTab(0, "all")).toBe("0"); // a falsy id is still a real link
  expect(initialRegisterTab(null, "all")).toBe("all");
  expect(initialRegisterTab(undefined, "all")).toBe("all");
});
