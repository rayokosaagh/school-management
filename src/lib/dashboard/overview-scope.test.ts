import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRANTS, type Capability } from "@/lib/auth/roles";
import type { Actor } from "@/lib/auth/scope";

const db = vi.hoisted(() => ({
  section: { findMany: vi.fn() },
  academicYear: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  feeStructure: { findMany: vi.fn() },
  invoice: { groupBy: vi.fn() },
  staff: { count: vi.fn() },
  grade: { count: vi.fn() },
  subject: { count: vi.fn() },
  subjectOffering: { findMany: vi.fn() },
  teacherAssignment: { count: vi.fn() },
  examTerm: { findMany: vi.fn() },
  attendanceSession: { findMany: vi.fn(), count: vi.fn() },
  attendanceRecord: { count: vi.fn(), findMany: vi.fn() },
  conductEntry: { count: vi.fn() },
  activityEntry: { count: vi.fn() },
}));
const dependencies = vi.hoisted(() => ({ grants: vi.fn(), workingDays: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/permissions", () => ({
  loadGrants: dependencies.grants,
  granted: (grants: Record<string, Set<string>>, role: string, capability: string) => grants[role].has(capability),
}));
vi.mock("@/lib/timetable/bell", () => ({ getWorkingDays: dependencies.workingDays }));

import { getDashboardOverview, schoolDate } from "./overview";

const teacher: Actor = { userId: 9, username: "teacher", role: "TEACHER", staffId: 7 };
const now = new Date("2026-09-06T03:00:00Z");
const day = new Date("2026-09-06T00:00:00Z");
const rows = [
  { id: 20, name: "A", gradeId: 2, classTeacherId: 7, grade: { name: "Class 2" }, _count: { enrollments: 12, assignments: 3 } },
  { id: 21, name: "B", gradeId: 2, classTeacherId: 8, grade: { name: "Class 2" }, _count: { enrollments: 10, assignments: 3 } },
];
const grants = (overrides: Partial<Record<Actor["role"], Capability[]>> = {}) => Object.fromEntries(
  Object.entries({ ...DEFAULT_GRANTS, ...overrides }).map(([role, caps]) => [role, new Set(caps)]),
);

beforeEach(() => {
  vi.resetAllMocks();
  dependencies.grants.mockResolvedValue(grants());
  dependencies.workingDays.mockResolvedValue([0, 1, 2, 3, 4, 5]);
  db.academicYear.findUnique.mockResolvedValue({ startsOn: new Date("2026-04-14Z"), endsOn: new Date("2027-04-13Z") });
  db.section.findMany.mockResolvedValue(rows);
  db.attendanceSession.findMany.mockResolvedValue([{ sectionId: 20 }]);
  db.attendanceRecord.findMany.mockResolvedValue([{ status: "PRESENT", session: { date: day } }]);
  db.attendanceRecord.count.mockResolvedValue(2);
  db.attendanceSession.count.mockResolvedValue(1);
  db.conductEntry.count.mockResolvedValue(3);
  db.activityEntry.count.mockResolvedValue(4);
  db.teacherAssignment.count.mockResolvedValue(3);
  db.staff.count.mockResolvedValue(30);
  db.grade.count.mockResolvedValue(10);
  db.subject.count.mockResolvedValue(8);
  db.subjectOffering.findMany.mockResolvedValue([{ gradeId: 2 }]);
  db.examTerm.findMany.mockResolvedValue([{ isPublished: false }]);
  db.academicYear.findUniqueOrThrow.mockResolvedValue({ nameBS: "2083" });
  db.feeStructure.findMany.mockResolvedValue([]);
  db.invoice.groupBy.mockResolvedValue([]);
});

describe("dashboard identity and capability scope", () => {
  it("limits teachers to current-year led/taught sections and their own assignments", async () => {
    const result = await getDashboardOverview(teacher, 5, now);
    expect(db.section.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      academicYearId: 5, OR: [{ classTeacherId: 7 }, { assignments: { some: { staffId: 7 } } }],
    } }));
    expect(db.teacherAssignment.count).toHaveBeenCalledWith({ where: { staffId: 7, section: { academicYearId: 5, id: { in: [20, 21] } } } });
    expect(db.attendanceRecord.count).toHaveBeenCalledWith({ where: { status: "ABSENT", session: { academicYearId: 5, sectionId: { in: [20, 21] }, date: day } } });
    expect(result.counts).toMatchObject({ students: 22, sections: 2, assignments: 3, staffTotal: 0, subjects: 0 });
    expect(result.today.missingAttendance).toEqual([{ id: 21, label: "Class 2 B" }]);
    expect(result.sections.map((s) => s.isClassTeacher)).toEqual([true, false]);
    expect(result.gaps).toEqual({ sectionsWithoutClassTeacher: [], unassignedSlots: 0, unpublishedExams: 0, examsTotal: 0, unbilledMonths: 0 });
    expect(db.staff.count).not.toHaveBeenCalled();
    expect(db.subject.count).not.toHaveBeenCalled();
    expect(db.subjectOffering.findMany).not.toHaveBeenCalled();
    expect(db.examTerm.findMany).not.toHaveBeenCalled();
  });

  it("never makes school or nullable staff queries for an unlinked teacher", async () => {
    const result = await getDashboardOverview({ ...teacher, staffId: null }, 5, now);
    expect(result.sections).toEqual([]);
    expect(Object.values(result.counts).every((n) => n === 0)).toBe(true);
    for (const model of Object.values(db)) for (const query of Object.values(model)) expect(query).not.toHaveBeenCalled();
  });

  it("returns no attendance when that grant is revoked, even for linked teachers", async () => {
    dependencies.grants.mockResolvedValue(grants({ TEACHER: ["view:records"] }));
    const result = await getDashboardOverview(teacher, 5, now);
    expect(result.access.attendance).toBe(false);
    expect(result.today.absent).toBe(0);
    expect(result.today.missingAttendance).toEqual([]);
    expect(result.trend.every((d) => d.marked === 0)).toBe(true);
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(db.attendanceSession.findMany).not.toHaveBeenCalled();
    expect(db.conductEntry.count).not.toHaveBeenCalled();
  });

  it("does not query protected school categories for an office user with no grants", async () => {
    dependencies.grants.mockResolvedValue(grants({ OFFICE: [] }));
    const result = await getDashboardOverview({ ...teacher, role: "OFFICE", staffId: null }, 5, now);
    expect(Object.values(result.counts).every((n) => n === 0)).toBe(true);
    expect(result.sections).toEqual([]);
    expect(Object.values(result.access).every((allowed) => !allowed)).toBe(true);
    for (const [name, model] of Object.entries(db)) {
      if (name === "academicYear") continue;
      for (const query of Object.values(model)) expect(query).not.toHaveBeenCalled();
    }
  });

  it("does not expose student totals to attendance-only office users", async () => {
    dependencies.grants.mockResolvedValue(grants({ OFFICE: ["take:attendance"] }));
    const result = await getDashboardOverview({ ...teacher, role: "OFFICE", staffId: null }, 5, now);
    expect(result.counts.students).toBe(0);
    expect(db.section.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ _count: false }) }));
    expect(result.today.absent).toBe(2);
    expect(db.examTerm.findMany).not.toHaveBeenCalled();
    expect(db.attendanceSession.count).not.toHaveBeenCalled();
  });

  it("loads administrative metrics only for the school scope", async () => {
    const result = await getDashboardOverview({ ...teacher, role: "ADMIN" }, 5, now);
    expect(db.section.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: 5 } }));
    expect(result.scope).toBe("school");
    expect(result.counts.staffTotal).toBe(30);
    expect(result.counts.grades).toBe(1);
    expect(db.grade.count).not.toHaveBeenCalled();
    expect(result.gaps.unpublishedExams).toBe(1);
  });

  it("scopes personal activity to the exact user, staff, year and teacher sections", async () => {
    const result = await getDashboardOverview(teacher, 5, now);
    expect(result.personal).toEqual({ attendanceTaken: 1, conductRecorded: 3, activitiesRecorded: 4 });
    expect(db.attendanceSession.count).toHaveBeenCalledWith({ where: { academicYearId: 5, sectionId: { in: [20, 21] }, date: day, takenById: 7 } });
    expect(db.conductEntry.count).toHaveBeenCalledWith({ where: { academicYearId: 5, date: day, recordedById: 9, student: { enrollments: { some: { academicYearId: 5, sectionId: { in: [20, 21] } } } } } });
    await getDashboardOverview({ ...teacher, userId: 10, staffId: 8 }, 5, now);
    expect(db.section.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { academicYearId: 5, OR: [{ classTeacherId: 8 }, { assignments: { some: { staffId: 8 } } }] } }));
    expect(db.activityEntry.count).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ recordedById: 10 }) }));
  });

  it("does not call empty-scope attendance queries for a teacher with no current sections", async () => {
    db.section.findMany.mockResolvedValue([]);
    const result = await getDashboardOverview(teacher, 5, now);
    expect(result.counts.students).toBe(0);
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(db.teacherAssignment.count).not.toHaveBeenCalled();
    expect(db.conductEntry.count).not.toHaveBeenCalled();
  });
});

describe("school calendar", () => {
  it("uses Nepal's calendar date across UTC midnight", () => {
    expect(schoolDate(new Date("2026-09-05T18:14:00Z"))).toEqual(new Date("2026-09-05T00:00:00Z"));
    expect(schoolDate(new Date("2026-09-05T18:15:00Z"))).toEqual(day);
  });

  it("does not raise missing roll call on a configured holiday", async () => {
    dependencies.workingDays.mockResolvedValue([1, 2, 3, 4, 5]);
    const result = await getDashboardOverview(teacher, 5, now);
    expect(result.schoolDay).toBe(false);
    expect(result.today.missingAttendance).toEqual([]);
  });

  it("does not raise missing roll call outside the selected academic year", async () => {
    db.academicYear.findUnique.mockResolvedValue({ startsOn: new Date("2025-04-14Z"), endsOn: new Date("2026-04-13Z") });
    const result = await getDashboardOverview(teacher, 5, now);
    expect(result.schoolDay).toBe(false);
    expect(result.today.missingAttendance).toEqual([]);
  });
});
