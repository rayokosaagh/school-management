import { describe, expect, it } from "vitest";
import { cellAt } from "./schedule";

// Saving the Room field trusts whatever cellAt hands back as "the lesson
// already here" (timetable-workspace.tsx onSelect). If this ever finds the
// wrong cell — or silently finds one when it should find none — the room
// field seeds from the wrong lesson, or from none, and a plain Save either
// wipes a room that was there or writes one lesson's room onto another's.

const cells = [
  { dayOfWeek: 0, schoolPeriodId: 1, room: "Room 12" },
  { dayOfWeek: 0, schoolPeriodId: 2, room: "" },
  { dayOfWeek: 1, schoolPeriodId: 1, room: "Lab A" },
];

describe("cellAt", () => {
  it("finds the lesson at that day and period", () => {
    expect(cellAt(cells, { dayOfWeek: 1, schoolPeriodId: 1 })).toEqual({
      dayOfWeek: 1,
      schoolPeriodId: 1,
      room: "Lab A",
    });
  });

  it("does not confuse the same period on a different day", () => {
    expect(cellAt(cells, { dayOfWeek: 0, schoolPeriodId: 1 })?.room).toBe("Room 12");
  });

  it("returns null for a free period with no lesson booked", () => {
    expect(cellAt(cells, { dayOfWeek: 2, schoolPeriodId: 1 })).toBeNull();
  });

  it("returns null when nothing is selected, rather than the first cell", () => {
    expect(cellAt(cells, null)).toBeNull();
  });

  it("returns the empty room a lesson genuinely has, not a fallback", () => {
    expect(cellAt(cells, { dayOfWeek: 0, schoolPeriodId: 2 })?.room).toBe("");
  });
});
