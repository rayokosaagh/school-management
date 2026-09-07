import { describe, expect, it } from "vitest";
import { summarizeClassAttendance, summarizeStudentAttendance } from "./attendance";

describe("summarizeClassAttendance", () => {
  it("counts class attendance and treats late as attended", () => {
    const result = summarizeClassAttendance({
      id: 12,
      name: "A",
      grade: { name: "Grade 4" },
      enrollments: [
        { student: { status: "ACTIVE" } },
        { student: { status: "ACTIVE" } },
        { student: { status: "LEFT" } },
      ],
      attendance: [
        { records: [{ status: "PRESENT" }, { status: "ABSENT" }] },
        { records: [{ status: "LATE" }, { status: "LEAVE" }] },
      ],
    });

    expect(result).toEqual({
      sectionId: 12,
      section: "Grade 4 A",
      students: 2,
      daysRecorded: 2,
      present: 1,
      absent: 1,
      late: 1,
      leave: 1,
      rate: 50,
    });
  });

  it("does not report zero attendance when no roll call was recorded", () => {
    const result = summarizeClassAttendance({
      id: 3,
      name: "B",
      grade: { name: "Grade 1" },
      enrollments: [],
      attendance: [],
    });

    expect(result.rate).toBeNull();
    expect(result.daysRecorded).toBe(0);
  });
});

describe("summarizeStudentAttendance", () => {
  it("keeps daily statuses and trimmed notes while calculating attendance", () => {
    const periodFrom = new Date(Date.UTC(2026, 3, 14));
    const enrolledOn = new Date(Date.UTC(2026, 3, 20));
    const records = [
      { date: new Date(Date.UTC(2026, 3, 20)), status: "PRESENT" as const, note: null },
      { date: new Date(Date.UTC(2026, 3, 21)), status: "LATE" as const, note: null },
      { date: new Date(Date.UTC(2026, 3, 22)), status: "LEAVE" as const, note: "  Medical visit  " },
      { date: new Date(Date.UTC(2026, 3, 23)), status: "ABSENT" as const, note: null },
    ];

    const result = summarizeStudentAttendance(
      {
        studentId: 5,
        fullName: "Asha Rai",
        admissionNo: "0012",
        photoId: null,
        status: "ACTIVE",
        rollNo: 3,
        enrolledOn,
      },
      records,
      periodFrom,
    );

    expect(result).toMatchObject({
      present: 1,
      absent: 1,
      late: 1,
      leave: 1,
      rate: 50,
      from: enrolledOn,
    });
    expect(result.days).toBe(records);
    expect(result.notes).toEqual([
      { date: records[2].date, status: "LEAVE", note: "Medical visit" },
    ]);
  });
});
