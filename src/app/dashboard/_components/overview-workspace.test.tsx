import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/scope";
import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { TodayPeriod } from "@/lib/dashboard/teacher-schedule";
import { OverviewWorkspace } from "./overview-workspace";

// The announcements panel reaches the dashboard server actions, and those pull
// NextAuth in on import. This test renders markup; it has no business booting
// an auth stack to do it.
vi.mock("../actions", () => ({
  postAnnouncement: vi.fn(),
  editAnnouncement: vi.fn(),
  withdrawAnnouncement: vi.fn(),
  readAnnouncement: vi.fn(),
  readAllAnnouncements: vi.fn(),
  switchAcademicYear: vi.fn(),
}));

// Vitest uses the repository's preserve JSX setting. Next supplies React's
// automatic runtime in production; expose it for server rendering here.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const teacher: Actor = { userId: 12, username: "Maya", role: "TEACHER", staffId: 4 };
const date = new Date("2026-09-06T00:00:00Z");
const lesson: TodayPeriod = {
  id: 3, periodName: "Period 1", startMinute: 600, endMinute: 645,
  subject: "Mathematics", classSection: "Class 5 A", room: "Room 4", isCurrent: true,
};

function overview(role: Actor["role"] = "TEACHER"): DashboardOverview {
  const school = role !== "TEACHER";
  return {
    scope: school ? "school" : "teacher", schoolDay: true,
    access: { records: true, attendance: true, registry: school, marks: true, manageExams: school, fees: school, settings: role === "ADMIN", timetable: true, announce: role === "ADMIN" },
    counts: { students: 24, staffTotal: school ? 10 : 0, staffActive: school ? 9 : 0, grades: 1, sections: 1, subjects: school ? 8 : 0, offerings: school ? 8 : 0, assignments: 2 },
    sections: [{ id: 42, label: "Class 5 A", students: 24, isClassTeacher: !school, attendanceTaken: false }],
    today: { date, missingAttendance: [{ id: 42, label: "Class 5 A" }], sectionsTotal: 1, absent: 0 },
    gaps: { sectionsWithoutClassTeacher: [], unassignedSlots: school ? 2 : 0, unpublishedExams: school ? 1 : 0, examsTotal: school ? 2 : 0, unbilledMonths: 0 },
    personal: { attendanceTaken: 2, conductRecorded: 3, activitiesRecorded: 1 },
    trend: [{ date, present: 20, marked: 24 }],
  };
}

function render(actor: Actor, data = overview(actor.role), periods: TodayPeriod[] = []) {
  const html = renderToStaticMarkup(React.createElement(OverviewWorkspace, {
    actor, overview: data, periods, yearLabel: "2083",
    announcements: [], manageableAnnouncements: [],
    insights: { marks: [], watch: [], money: null }, notice: null,
  }));
  return {
    html,
    text: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "),
    links: [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
  };
}

describe("role-specific overview workspace", () => {
  it("shows a teacher's identity, classes, schedule and scoped attendance action", () => {
    const result = render(teacher, overview(), [lesson]);
    expect(result.text).toContain("My workspace");
    expect(result.text).toContain("Welcome back, Maya.");
    expect(result.text).toContain("My students");
    expect(result.text).toContain("My classes");
    expect(result.text).toContain("Mathematics");
    expect(result.text).toContain("Class 5 A");
    expect(result.links).toContain("/dashboard/attendance?section=42");
    expect(result.links).toContain("/dashboard/classes?view=timetable");
    expect(result.text).not.toContain("Active staff");
    expect(result.text).not.toContain("Student admissions");
    expect(result.text).not.toContain("School settings");
    expect(result.text).not.toContain("not published yet");
    expect(result.links).not.toContain("/dashboard/settings");
    expect(result.links).not.toContain("/dashboard/fees");
    expect(result.links).not.toContain("/dashboard/assignments");
  });

  it("gives office users operational tools without administrator settings", () => {
    const result = render({ ...teacher, username: "Ravi", role: "OFFICE", staffId: null });
    expect(result.text).toContain("Office workspace");
    expect(result.text).toContain("Welcome back, Ravi.");
    expect(result.text).toContain("Students enrolled");
    expect(result.text).toContain("Active staff");
    expect(result.text).toContain("Manage fees");
    expect(result.text).toContain("Student admissions");
    expect(result.text).not.toContain("Lessons today");
    expect(result.links).toContain("/dashboard/fees");
    expect(result.links).not.toContain("/dashboard/settings");
  });

  it("includes school setup and account tools for administrators", () => {
    const result = render({ ...teacher, username: "Principal", role: "ADMIN" });
    expect(result.text).toContain("School workspace");
    expect(result.text).toContain("Welcome back, Principal.");
    expect(result.text).toContain("School settings");
    expect(result.links).toContain("/dashboard/settings");
    expect(result.links).toContain("/dashboard/assignments");
    expect(result.links).toContain("/dashboard/exams");
  });

  it("does not render restricted metrics or destinations when office grants are denied", () => {
    const data = overview("OFFICE");
    data.access = { records: false, attendance: false, registry: false, marks: false, manageExams: false, fees: false, settings: false, timetable: false, announce: false };
    data.personal = { attendanceTaken: 0, conductRecorded: 0, activitiesRecorded: 0 };
    const result = render({ ...teacher, role: "OFFICE" }, data);
    expect(result.links).toEqual([]);
    expect(result.text).not.toContain("Students enrolled");
    expect(result.text).not.toContain("Active staff");
    expect(result.text).not.toContain("Roll calls pending");
    expect(result.text).toContain("Your administrator can enable the tools you need");
  });

  it("explains how an unlinked teacher can obtain their personal workspace", () => {
    const data = overview();
    data.access.timetable = false;
    data.counts = { students: 0, staffTotal: 0, staffActive: 0, grades: 0, sections: 0, subjects: 0, offerings: 0, assignments: 0 };
    data.sections = [];
    data.today = { date, missingAttendance: [], sectionsTotal: 0, absent: 0 };
    data.personal = { attendanceTaken: 0, conductRecorded: 0, activitiesRecorded: 0 };
    const result = render({ ...teacher, staffId: null }, data);
    expect(result.text).toContain("Ask your administrator to link this account to your staff record");
    expect(result.text).not.toContain("Active staff");
    expect(result.links).not.toContain("/dashboard/classes?view=timetable");
    expect(result.links.some((href) => href.startsWith("/dashboard/attendance?section="))).toBe(false);
  });

  it("does not send teachers to overdue roll call on a non-working day", () => {
    const data = overview();
    data.schoolDay = false;
    data.today.missingAttendance = [];
    const result = render(teacher, data);
    expect(result.text).toContain("No roll call due");
    expect(result.text).toContain("View my timetable");
    expect(result.text).not.toContain("Mark my class");
  });
});
