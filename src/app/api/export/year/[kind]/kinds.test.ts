import { describe, expect, it } from "vitest";
import { isExportKind } from "./kinds";

describe("isExportKind", () => {
  it("accepts every registered export kind", () => {
    expect(isExportKind("register")).toBe(true);
    expect(isExportKind("attendance")).toBe(true);
    expect(isExportKind("marks")).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(isExportKind("nope")).toBe(false);
  });

  // A plain `BUILDERS[kind]` lookup resolves these to prototype-chain values
  // that were never assigned in this module — the guard must reject them
  // exactly like any other unrecognised kind, not treat them as special.
  it("rejects prototype-chain keys", () => {
    expect(isExportKind("__proto__")).toBe(false);
    expect(isExportKind("constructor")).toBe(false);
    expect(isExportKind("toString")).toBe(false);
    expect(isExportKind("hasOwnProperty")).toBe(false);
  });
});
