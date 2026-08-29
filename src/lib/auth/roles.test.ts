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
  });

  it("limits a teacher to marks, attendance and viewing by default", () => {
    expect(canByDefault("TEACHER", "enter:marks")).toBe(true);
    expect(canByDefault("TEACHER", "take:attendance")).toBe(true);
    expect(canByDefault("TEACHER", "view:records")).toBe(true);
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
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });
});
