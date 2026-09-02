import { describe, expect, it } from "vitest";
import { CODE, recordCode, studentCode } from "./record-code";

describe("studentCode", () => {
  it("follows the admission number the school issues", () => {
    expect(studentCode("1")).toBe("STU-01");
    expect(studentCode("42")).toBe("STU-42");
  });

  it("lets a number longer than the padding run longer", () => {
    expect(studentCode("106")).toBe("STU-106");
    expect(studentCode("2083014")).toBe("STU-2083014");
  });

  it("shows a non-numeric admission number as written", () => {
    expect(studentCode("2083-014")).toBe("STU-2083-014");
    expect(studentCode(" 7 ")).toBe("STU-07");
  });

  it("has nothing to show without an admission number", () => {
    expect(studentCode("")).toBe("—");
  });
});

describe("recordCode", () => {
  it("pads to four digits so codes line up in a column", () => {
    expect(recordCode("STF", 7)).toBe("STF-0007");
    expect(recordCode("STF", 1234)).toBe("STF-1234");
  });

  it("keeps ids longer than the padding intact", () => {
    expect(recordCode("STU", 98765)).toBe("STU-98765");
  });

  it("refuses anything that is not a real id", () => {
    expect(recordCode("STF", -1)).toBe("—");
    expect(recordCode("STF", 1.5)).toBe("—");
    expect(recordCode("STF", Number.NaN)).toBe("—");
  });

  it("gives each record type its own prefix", () => {
    expect(CODE.staff(35)).toBe("STF-0035");
    expect(CODE.section(5)).toBe("SEC-0005");
    expect(CODE.exam(8)).toBe("EXM-0008");
    expect(CODE.subject(2)).toBe("SUB-0002");
  });
});
