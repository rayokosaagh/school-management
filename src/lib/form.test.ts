import { describe, expect, it } from "vitest";
import { numericField } from "./form";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

describe("numericField", () => {
  it("reads a positive integer id", () => {
    expect(numericField(form({ id: "42" }), "id")).toBe(42);
  });

  it("rejects an empty field", () => {
    // The bug this exists for: Number("") is 0, which passes Number.isInteger
    // and would reach the database as id 0.
    expect(Number.isInteger(Number(""))).toBe(true);
    expect(numericField(form({ id: "" }), "id")).toBeNull();
    expect(numericField(form({ id: "   " }), "id")).toBeNull();
  });

  it("rejects a missing field", () => {
    expect(Number.isInteger(Number(null))).toBe(true);
    expect(numericField(form({}), "id")).toBeNull();
  });

  it("rejects zero and negatives, which are never real ids", () => {
    expect(numericField(form({ id: "0" }), "id")).toBeNull();
    expect(numericField(form({ id: "-3" }), "id")).toBeNull();
  });

  it("rejects anything that is not a whole number", () => {
    expect(numericField(form({ id: "1.5" }), "id")).toBeNull();
    expect(numericField(form({ id: "abc" }), "id")).toBeNull();
    expect(numericField(form({ id: "Infinity" }), "id")).toBeNull();
  });
});
