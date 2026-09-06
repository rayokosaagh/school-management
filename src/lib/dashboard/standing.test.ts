import { describe, expect, it } from "vitest";
import { rollCallStanding } from "./standing";

const access = {
  records: true, attendance: true, registry: false, marks: false,
  manageExams: false, fees: false, settings: false, timetable: false, announce: false,
};

const base = {
  access,
  schoolDay: true,
  sections: [
    { id: 1, label: "Class 1 A", students: 20, isClassTeacher: false, attendanceTaken: true },
    { id: 2, label: "Class 2 A", students: 18, isClassTeacher: false, attendanceTaken: true },
    { id: 3, label: "Class 3 A", students: 22, isClassTeacher: false, attendanceTaken: false },
    { id: 4, label: "Class 4 A", students: 19, isClassTeacher: false, attendanceTaken: false },
  ],
  today: {
    date: new Date("2026-09-06T00:00:00Z"),
    missingAttendance: [{ id: 3, label: "Class 3 A" }, { id: 4, label: "Class 4 A" }],
    sectionsTotal: 4,
    absent: 3,
  },
};

describe("rollCallStanding", () => {
  it("reads saved, pending and completion from one place", () => {
    expect(rollCallStanding(base)).toEqual({
      total: 4,
      saved: 2,
      pending: base.today.missingAttendance,
      percent: 50,
      due: true,
    });
  });

  // The bug this function exists to prevent: on a holiday the server empties
  // missingAttendance, so a header counting that list said "no roll call due"
  // while a panel counting saved registers said "2 of 4 saved" on the same
  // screen. Both numbers stay true; `due` is what the copy keys off now.
  it("keeps counting saved registers on a day no register is owed", () => {
    const standing = rollCallStanding({
      ...base,
      schoolDay: false,
      today: { ...base.today, missingAttendance: [] },
    });
    expect(standing.due).toBe(false);
    expect(standing.saved).toBe(2);
    expect(standing.percent).toBe(50);
  });

  it("is not due for a reader who cannot take attendance", () => {
    expect(rollCallStanding({ ...base, access: { ...access, attendance: false } }).due).toBe(false);
  });

  it("reports nought rather than NaN when there are no sections", () => {
    const standing = rollCallStanding({
      ...base,
      sections: [],
      today: { ...base.today, missingAttendance: [], sectionsTotal: 0 },
    });
    expect(standing.percent).toBe(0);
    expect(standing.saved).toBe(0);
  });

  it("rounds completion to a whole percent", () => {
    const standing = rollCallStanding({
      ...base,
      sections: base.sections.slice(0, 3),
      today: { ...base.today, sectionsTotal: 3 },
    });
    expect(standing.percent).toBe(67);
  });
});
