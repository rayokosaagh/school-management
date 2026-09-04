import { describe, expect, it } from "vitest";
import { resolveRollCallDate } from "./roll-call-date";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// A generous academic-year window; only the "outside the year" case needs it
// tight.
const bounds = { startsOn: utc(2025, 4, 14), endsOn: utc(2026, 4, 13) };
const today = utc(2025, 12, 25);

describe("resolveRollCallDate", () => {
  it("uses a valid date as given, with no error", () => {
    const result = resolveRollCallDate("2082-01-01", bounds, today);
    expect(result).toEqual({ date: utc(2025, 4, 14), error: null });
  });

  it("falls back and reports an impossible date (2082-01-32)", () => {
    const result = resolveRollCallDate("2082-01-32", bounds, today);
    expect(result.date).toEqual(today);
    expect(result.error).toBe('"2082-01-32" is not a valid date — showing 2082-09-10 instead.');
  });

  it("falls back and reports a malformed string", () => {
    const result = resolveRollCallDate("not-a-date", bounds, today);
    expect(result.date).toEqual(today);
    expect(result.error).toContain('"not-a-date" is not a valid date');
  });

  it("falls back silently when the param is absent — the common case", () => {
    const result = resolveRollCallDate(undefined, bounds, today);
    expect(result).toEqual({ date: today, error: null });
  });

  it("falls back silently when the param is empty", () => {
    const result = resolveRollCallDate("", bounds, today);
    expect(result).toEqual({ date: today, error: null });
  });

  it("clamps the fallback into the academic year when today falls outside it", () => {
    const tightBounds = { startsOn: utc(2025, 4, 14), endsOn: utc(2025, 6, 1) };
    const result = resolveRollCallDate("garbage", tightBounds, today);
    expect(result.date).toEqual(tightBounds.endsOn);
    expect(result.error).toContain("garbage");
  });

  it("passes a valid date outside the academic year through unchanged", () => {
    // Not this function's job to police the year — `assertWithinYear` in the
    // attendance lib already reports that, per section, as `sheetError`.
    const result = resolveRollCallDate("2090-01-01", bounds, today);
    expect(result.date).toEqual(utc(2033, 4, 14));
    expect(result.error).toBeNull();
  });
});
