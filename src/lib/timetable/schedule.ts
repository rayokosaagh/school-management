// The shape of the school week, with no database in it. The grid, the School
// day form and the validator all run in the browser, so these types and rules
// live apart from the queries in bell.ts — importing a Prisma module into a
// client component drags node:module into the browser bundle and fails the build.

/// Sunday = 0 through Saturday = 6, matching JavaScript's getDay(). Saturday is
/// the weekly holiday in Nepal, so the default week runs Sunday to Friday.
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 5];

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/// Deliberately not imported from the generated Prisma client: this file runs
/// in the browser (see the file header), and that import drags node:module
/// into the bundle. The three values are pinned to the PeriodKind enum in
/// schema.prisma by day-shapes.test.ts and bell.test.ts exercising both sides.
export type PeriodKind = "TEACHING" | "BREAK" | "EVENT";

export type BellInput = {
  /// Position in the day, contiguous from 0. Not the period's number: a break
  /// or an event takes an order too, so "Period 4" may sit at order 4.
  order: number;
  name: string;
  startMinute: number;
  endMinute: number;
  kind: PeriodKind;
  /// Shown in the grid for an EVENT period. Empty for TEACHING and BREAK —
  /// validateBell refuses the two states from disagreeing.
  label: string;
};

export type BellPeriod = BellInput & { id: number };

export class BellScheduleError extends Error {}

const MINUTES_IN_DAY = 1440;

/// A starting point the school edits, not a constant anything depends on.
export const DEFAULT_BELL: BellInput[] = [
  { order: 0, name: "Period 1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
  { order: 1, name: "Period 2", startMinute: 645, endMinute: 690, kind: "TEACHING", label: "" },
  { order: 2, name: "Period 3", startMinute: 690, endMinute: 735, kind: "TEACHING", label: "" },
  { order: 3, name: "Tiffin", startMinute: 735, endMinute: 765, kind: "BREAK", label: "" },
  { order: 4, name: "Period 4", startMinute: 765, endMinute: 810, kind: "TEACHING", label: "" },
  { order: 5, name: "Period 5", startMinute: 810, endMinute: 855, kind: "TEACHING", label: "" },
  { order: 6, name: "Period 6", startMinute: 855, endMinute: 900, kind: "TEACHING", label: "" },
  { order: 7, name: "Period 7", startMinute: 900, endMinute: 945, kind: "TEACHING", label: "" },
];

/// Pure, so the form can check a draft without a round trip and the rules can
/// be tested without a database. Throws on the first problem it finds, with a
/// message written for the person editing the schedule rather than for a log.
export function validateBell(rows: BellInput[]): void {
  if (rows.length === 0) {
    throw new BellScheduleError("A school day needs at least one period.");
  }
  if (rows.every((row) => row.kind === "BREAK")) {
    throw new BellScheduleError(
      "A school day needs at least one period that is not a break.",
    );
  }

  for (const row of rows) {
    const name = row.name.trim();
    if (name === "") {
      throw new BellScheduleError("Every period needs a name.");
    }
    if (!Number.isInteger(row.startMinute) || !Number.isInteger(row.endMinute)) {
      throw new BellScheduleError(`${name} has a time that is not a whole minute.`);
    }
    if (row.startMinute < 0 || row.endMinute > MINUTES_IN_DAY) {
      throw new BellScheduleError(`${name} falls outside the day.`);
    }
    if (row.startMinute >= row.endMinute) {
      throw new BellScheduleError(`${name} ends before it starts.`);
    }
    // Mirrors validatePeriodKind in day-shapes.ts, not imported from it: that
    // module pulls in prisma, which this browser-safe file cannot carry.
    if (row.kind === "EVENT" && row.label.trim() === "") {
      throw new BellScheduleError(`${name} is an event and needs a label.`);
    }
    if (row.kind !== "EVENT" && row.label.trim() !== "") {
      throw new BellScheduleError(`${name} is not an event and cannot carry a label.`);
    }
  }

  // Case-folded: "Period 1" and "period 1" are the same slot to anyone reading
  // a printed timetable, and two rows with one name make the grid unreadable.
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new BellScheduleError(
        `Two periods have the same name (${row.name.trim()}).`,
      );
    }
    seen.add(key);
  }

  // Contiguous from zero. The order is what the grid sorts by, so a gap would
  // leave a row that no cell can be addressed against.
  const orders = [...rows].map((row) => row.order).sort((a, b) => a - b);
  if (orders.some((order, i) => order !== i)) {
    throw new BellScheduleError(
      "Periods must be numbered from the top of the day without gaps.",
    );
  }

  // Overlap, checked in time order rather than in `order` order, so a schedule
  // whose numbering disagrees with its clock is still caught.
  const byTime = [...rows].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 1; i < byTime.length; i++) {
    const previous = byTime[i - 1];
    const current = byTime[i];
    if (current.startMinute < previous.endMinute) {
      throw new BellScheduleError(
        `${current.name.trim()} overlaps ${previous.name.trim()}.`,
      );
    }
  }
}


// ---------------------------------------------------------------------------
// The school clock. Lives here rather than beside the dashboard query because
// the grid draws a live "now" marker in the browser, and the query module
// imports Prisma.
// ---------------------------------------------------------------------------

const SCHOOL_TIME_ZONE = "Asia/Kathmandu";

const WEEKDAY_NUMBER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/// The school's Nepal wall clock, whatever timezone the server or the reader's
/// laptop is in.
export function schoolTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  const weekday = value("weekday");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  if (weekday === undefined || WEEKDAY_NUMBER[weekday] === undefined) {
    throw new Error("Could not determine the school weekday.");
  }

  return {
    dayOfWeek: WEEKDAY_NUMBER[weekday],
    minuteOfDay: hour * 60 + minute,
  };
}

export function formatMinute(minute: number) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function periodIsCurrent(
  period: { startMinute: number; endMinute: number },
  minuteOfDay: number,
) {
  return period.startMinute <= minuteOfDay && minuteOfDay < period.endMinute;
}

/// Address of one grid cell: a day and a bell period.
export type CellAddress = { dayOfWeek: number; schoolPeriodId: number };

/// The lesson at an address, or null when nothing is selected or nothing is
/// booked there. Pulled out so the room field can be seeded from the real
/// lesson rather than left blank — a field left blank looked identical to one
/// carrying the room only as a placeholder, and Save then wiped the room
/// silently. This function is what a unit test can pin down without a browser.
export function cellAt<T extends CellAddress>(
  cells: T[],
  address: CellAddress | null,
): T | null {
  if (address === null) return null;
  return (
    cells.find(
      (cell) =>
        cell.dayOfWeek === address.dayOfWeek &&
        cell.schoolPeriodId === address.schoolPeriodId,
    ) ?? null
  );
}

/// How far through a period the clock is, 0 to 1. Drives the line that tracks
/// the current lesson down its cell.
export function periodProgress(
  period: { startMinute: number; endMinute: number },
  minuteOfDay: number,
) {
  const span = period.endMinute - period.startMinute;
  if (span <= 0) return 0;
  const through = (minuteOfDay - period.startMinute) / span;
  return Math.min(1, Math.max(0, through));
}

// ---------------------------------------------------------------------------
// Day shapes, on the browser side. day-shapes.ts carries the database calls
// and cannot be imported here (it pulls in Prisma); these three are the pure
// pieces the shape switcher and its confirmations need, kept testable apart
// from any component.
// ---------------------------------------------------------------------------

export type ShapeWeekdays = { id: number; weekdays: number[] };

/// Which shape each weekday is on, the other way round from how
/// DayShapeSummary carries it (shape -> its weekdays). Every weekday resolves
/// to exactly one shape — listDayShapes() already guarantees that — so this
/// is a plain flip, not a merge that could disagree with itself.
export function shapeIdByDay(shapes: ShapeWeekdays[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const shape of shapes) {
    for (const day of shape.weekdays) map[day] = shape.id;
  }
  return map;
}

export type OrphanPreview = {
  count: number;
  sections: { id: number; name: string; gradeName: string }[];
};

/// What the weekday-reassignment confirmation says before it lets the change
/// through. Named classes, not just a count — "3 lessons" alone does not tell
/// anyone which register loses its Friday period 6.
export function describeOrphanedLessons(orphaned: OrphanPreview): string {
  if (orphaned.count === 0) return "No lessons will be removed.";
  const classes = orphaned.sections.map((s) => `${s.gradeName} ${s.name}`).join(", ");
  return `${orphaned.count} lesson${orphaned.count === 1 ? "" : "s"} will be deleted, from ${classes}.`;
}

/// What the clear-timetable confirmation says, for either scope.
export function describeClear(count: number, scopeLabel: string): string {
  if (count === 0) return `${scopeLabel} has no lessons scheduled.`;
  return `This deletes ${count} lesson${count === 1 ? "" : "s"} from ${scopeLabel}.`;
}

export type DayColumnEntry<P, C> = { period: P; cell: C | null };

/// One weekday's own column: its periods, each paired with the lesson booked
/// into it, or null for a free slot, a break or an event. `periods` is
/// already that day's own shape (see SectionGrid.periodsByDay) — this never
/// sees another day's periods to pad itself out with, which is the exact
/// fix for the grid used to show an inert cell for a period a shorter day
/// simply does not have.
export function buildDayColumn<
  P extends { id: number },
  C extends { schoolPeriodId: number },
>(periods: P[], cellsForDay: C[]): DayColumnEntry<P, C>[] {
  const byPeriod = new Map(cellsForDay.map((cell) => [cell.schoolPeriodId, cell]));
  return periods.map((period) => ({ period, cell: byPeriod.get(period.id) ?? null }));
}

// ---------------------------------------------------------------------------
// Subject colour. A timetable is read by pattern far more often than by word —
// "where is my Nepali?" — so each subject keeps one hue across every class.
// ---------------------------------------------------------------------------

/// How many tones globals.css defines as --subject-0 .. --subject-N.
export const SUBJECT_TONES = 8;

/// The tone for a subject at a given rank in the school's subject list, ordered
/// by id — that is, by the order the school created them.
///
/// This started as a hash of the subject's name, which was wrong: FNV mixed
/// well enough to pass a spread test and still put English, Nepali, Computer
/// and Moral Education on one colour, and English and Nepali sit side by side
/// in every single class. Ranking cannot collide until a school has more than
/// eight subjects, and ordering by id rather than by name means adding a
/// subject appends a colour instead of shifting everyone else's.
export function toneForRank(rank: number): number {
  return ((rank % SUBJECT_TONES) + SUBJECT_TONES) % SUBJECT_TONES;
}
