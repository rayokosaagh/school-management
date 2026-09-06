export type YearDateStatus = "past" | "present" | "upcoming";

/** Dates must use the same school-date convention; both endpoints are inclusive. */
export function yearDateStatus(today: Date, year: { startsOn: Date; endsOn: Date } | null): YearDateStatus | null {
  if (!year) return null;
  if (today < year.startsOn) return "upcoming";
  if (today > year.endsOn) return "past";
  return "present";
}
