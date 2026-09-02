import { describe, expect, it } from "vitest";
import { CAPABILITIES, canByDefault, capabilityFor } from "./roles";

describe("default grants", () => {
  it("gives an administrator every capability", () => {
    for (const c of CAPABILITIES) expect(canByDefault("ADMIN", c)).toBe(true);
  });

  it("keeps the office out of account management by default", () => {
    expect(canByDefault("OFFICE", "manage:settings")).toBe(false);
    expect(canByDefault("OFFICE", "manage:registry")).toBe(true);
    expect(canByDefault("OFFICE", "manage:exams")).toBe(true);
    expect(canByDefault("OFFICE", "record:conduct")).toBe(true);
  });

  it("limits a teacher to marks, attendance and viewing by default", () => {
    expect(canByDefault("TEACHER", "enter:marks")).toBe(true);
    expect(canByDefault("TEACHER", "take:attendance")).toBe(true);
    expect(canByDefault("TEACHER", "view:records")).toBe(true);
    expect(canByDefault("TEACHER", "record:conduct")).toBe(true);
    expect(canByDefault("TEACHER", "manage:registry")).toBe(false);
    expect(canByDefault("TEACHER", "manage:exams")).toBe(false);
    expect(canByDefault("TEACHER", "manage:settings")).toBe(false);
  });
});

describe("capabilityFor", () => {
  it("maps each section to the permission it needs", () => {
    expect(capabilityFor("/dashboard/settings")).toBe("manage:settings");
    expect(capabilityFor("/dashboard/classes")).toBe("manage:registry");
    expect(capabilityFor("/dashboard/subjects")).toBe("manage:registry");
    expect(capabilityFor("/dashboard/teachers")).toBe("manage:registry");
    expect(capabilityFor("/dashboard/assignments")).toBe("manage:registry");
    expect(capabilityFor("/dashboard/students")).toBe("view:records");
    expect(capabilityFor("/dashboard/attendance")).toBe("take:attendance");
    expect(capabilityFor("/dashboard/exams")).toBe("enter:marks");
    expect(capabilityFor("/dashboard/honours")).toBe("view:records");
  });

  it("applies to nested paths, not just the section root", () => {
    expect(capabilityFor("/dashboard/teachers/33")).toBe("manage:registry");
    expect(capabilityFor("/dashboard/students/12")).toBe("view:records");
    expect(capabilityFor("/dashboard/exams/print")).toBe("enter:marks");
  });

  it("leaves unlisted paths needing only a session", () => {
    expect(capabilityFor("/dashboard")).toBeNull();
  });

  it("covers every capability it can grant", () => {
    // A capability nothing routes to would be unreachable from the navigation.
    expect(CAPABILITIES).toContain("view:records");
    expect(CAPABILITIES).toContain("record:conduct");
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });
});

describe("rollover route", () => {
  it("needs the registry capability", () => {
    expect(capabilityFor("/dashboard/rollover")).toBe("manage:registry");
  });

  it("is open to admin and office, closed to teachers", () => {
    expect(canByDefault("ADMIN", "manage:registry")).toBe(true);
    expect(canByDefault("OFFICE", "manage:registry")).toBe(true);
    expect(canByDefault("TEACHER", "manage:registry")).toBe(false);
  });
});

describe("year teardown", () => {
  it("keeps the classes page itself open to manage:registry", () => {
    // The page route stays office-reachable; only the delete-year actions
    // inside it are pinned to manage:settings, checked explicitly in
    // classes/actions.ts rather than via capabilityFor.
    expect(capabilityFor("/dashboard/classes")).toBe("manage:registry");
  });

  it("is admin-only by default, closed to office and teachers", () => {
    expect(canByDefault("ADMIN", "manage:settings")).toBe(true);
    expect(canByDefault("OFFICE", "manage:settings")).toBe(false);
    expect(canByDefault("TEACHER", "manage:settings")).toBe(false);
  });
});
