import { describe, expect, it } from "vitest";
import { csvResponse, safeText, toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header and rows", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\r\n1,2");
  });

  it("quotes fields containing a comma", () => {
    expect(toCsv(["x"], [["Thapa, Ramesh"]])).toBe('x\r\n"Thapa, Ramesh"');
  });

  it("doubles quotes inside a quoted field", () => {
    expect(toCsv(["x"], [['He said "hi"']])).toBe('x\r\n"He said ""hi"""');
  });

  it("quotes fields containing a newline", () => {
    expect(toCsv(["x"], [["line1\nline2"]])).toBe('x\r\n"line1\nline2"');
  });

  it("writes null and undefined as empty, not as the words", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,");
  });

  it("leaves Devanagari untouched", () => {
    expect(toCsv(["name"], [["सीता शर्मा"]])).toBe("name\r\nसीता शर्मा");
  });
});

describe("csvResponse", () => {
  it("leads with a byte order mark so Excel reads UTF-8", async () => {
    // Checked as bytes: Response.text() strips a leading BOM when decoding, so
    // reading it back as a string would always look like it was never sent.
    const bytes = new Uint8Array(await csvResponse("x.csv", "a\r\n1").arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("sets the download headers", () => {
    const res = csvResponse("students.csv", "a");
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="students.csv"',
    );
  });

  it("strips characters that would break out of the header", () => {
    const res = csvResponse('evil";x.csv', "a");
    expect(res.headers.get("Content-Disposition")).not.toContain('"; x');
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="evil_x.csv"');
  });
});

describe("safeText", () => {
  it("neutralises fields Excel would run as a formula", () => {
    expect(safeText("=1+1")).toBe("'=1+1");
    expect(safeText("+44 123")).toBe("'+44 123");
    expect(safeText("-5")).toBe("'-5");
    expect(safeText("@name")).toBe("'@name");
  });

  it("leaves ordinary text alone", () => {
    expect(safeText("Ramesh")).toBe("Ramesh");
    expect(safeText("9801234567")).toBe("9801234567");
    expect(safeText(42)).toBe("42");
  });
});
