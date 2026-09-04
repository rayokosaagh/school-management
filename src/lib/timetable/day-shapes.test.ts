import { describe, expect, it } from "vitest";
import { DayShapeError, validateDefaultShape, validatePeriodKind } from "./day-shapes";

// The two rules the schema cannot enforce on its own: exactly one shape may
// be the fallback every unassigned weekday resolves to, and a period's kind
// and label must agree.

describe("validateDefaultShape", () => {
  it("accepts exactly one default", () => {
    expect(() =>
      validateDefaultShape([{ isDefault: true }, { isDefault: false }]),
    ).not.toThrow();
  });

  it("rejects no default", () => {
    expect(() =>
      validateDefaultShape([{ isDefault: false }, { isDefault: false }]),
    ).toThrow(DayShapeError);
  });

  it("rejects more than one default", () => {
    expect(() =>
      validateDefaultShape([{ isDefault: true }, { isDefault: true }]),
    ).toThrow(DayShapeError);
  });

  it("rejects an empty list", () => {
    expect(() => validateDefaultShape([])).toThrow(/exactly one/i);
  });
});

describe("validatePeriodKind", () => {
  it("accepts a teaching period with no label", () => {
    expect(() => validatePeriodKind({ kind: "TEACHING", label: "" })).not.toThrow();
  });

  it("accepts a break with no label", () => {
    expect(() => validatePeriodKind({ kind: "BREAK", label: "" })).not.toThrow();
  });

  it("accepts an event with a label", () => {
    expect(() =>
      validatePeriodKind({ kind: "EVENT", label: "Assembly" }),
    ).not.toThrow();
  });

  it("rejects an event with no label", () => {
    expect(() => validatePeriodKind({ kind: "EVENT", label: "" })).toThrow(
      /needs a label/i,
    );
    expect(() => validatePeriodKind({ kind: "EVENT", label: "   " })).toThrow(
      /needs a label/i,
    );
  });

  it("rejects a teaching period carrying a label", () => {
    expect(() =>
      validatePeriodKind({ kind: "TEACHING", label: "Assembly" }),
    ).toThrow(/only an event/i);
  });

  it("rejects a break carrying a label", () => {
    expect(() => validatePeriodKind({ kind: "BREAK", label: "Tiffin" })).toThrow(
      /only an event/i,
    );
  });
});
