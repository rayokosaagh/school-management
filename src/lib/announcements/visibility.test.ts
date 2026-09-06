import { describe, expect, it } from "vitest";
import { byImportance, isLive, visibleTo } from "./visibility";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("visibleTo", () => {
  it("reaches everyone when addressed to everyone", () => {
    expect(visibleTo("TEACHER", "ALL")).toBe(true);
    expect(visibleTo("OFFICE", "ALL")).toBe(true);
    expect(visibleTo("ADMIN", "ALL")).toBe(true);
  });

  it("reaches only the role it names", () => {
    expect(visibleTo("TEACHER", "TEACHER")).toBe(true);
    expect(visibleTo("OFFICE", "TEACHER")).toBe(false);
    expect(visibleTo("OFFICE", "OFFICE")).toBe(true);
    expect(visibleTo("TEACHER", "OFFICE")).toBe(false);
  });

  // An administrator who cannot see a notice cannot correct or withdraw it.
  it("shows administrators every notice", () => {
    expect(visibleTo("ADMIN", "TEACHER")).toBe(true);
    expect(visibleTo("ADMIN", "OFFICE")).toBe(true);
  });
});

describe("isLive", () => {
  const today = day("2026-09-06");

  it("keeps a notice with no expiry for good", () => {
    expect(isLive({ expiresOn: null }, today)).toBe(true);
  });

  // "Expires on the last day of term" should mean the last day of term is the
  // last day it shows, not the day it disappears.
  it("still shows a notice on the day it expires", () => {
    expect(isLive({ expiresOn: day("2026-09-06") }, today)).toBe(true);
  });

  it("hides it the day after", () => {
    expect(isLive({ expiresOn: day("2026-09-05") }, today)).toBe(false);
  });

  it("keeps one that expires later", () => {
    expect(isLive({ expiresOn: day("2026-10-01") }, today)).toBe(true);
  });
});

describe("byImportance", () => {
  const at = (id: number, iso: string, isPinned = false) => ({
    id, isPinned, createdAt: new Date(iso),
  });

  it("puts pinned notices first however old they are", () => {
    const rows = [
      at(1, "2026-09-06T09:00:00Z"),
      at(2, "2026-01-01T09:00:00Z", true),
      at(3, "2026-09-05T09:00:00Z"),
    ];
    expect([...rows].sort(byImportance).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("orders the rest newest first", () => {
    const rows = [
      at(1, "2026-09-01T09:00:00Z"),
      at(2, "2026-09-06T09:00:00Z"),
      at(3, "2026-09-03T09:00:00Z"),
    ];
    expect([...rows].sort(byImportance).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  // Two notices posted in the same second must not swap places between
  // renders, so the tie is broken by something stable.
  it("breaks a tie on identity rather than leaving it to chance", () => {
    const rows = [
      at(1, "2026-09-06T09:00:00Z"),
      at(3, "2026-09-06T09:00:00Z"),
      at(2, "2026-09-06T09:00:00Z"),
    ];
    expect([...rows].sort(byImportance).map((r) => r.id)).toEqual([3, 2, 1]);
  });
});
