import NepaliDateTime from "nepali-datetime";

// Bikram Sambat is the operating calendar for Nepali schools, but every date is
// stored as a Gregorian `@db.Date` and converted only at the edges — here.

export type BsDate = { year: number; month: number; day: number };

// Bounds of the conversion table in nepali-datetime; outside this it throws.
export const BS_MIN_YEAR = 2000;
export const BS_MAX_YEAR = 2099;

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
] as const;

export class BsRangeError extends Error {}

// Prisma `@db.Date` values come back as UTC midnight, so calendar components are
// read and written in UTC. The library wants a local Date, hence the two helpers.
function utcParts(date: Date) {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function fromUtcParts(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function assertInRange(year: number) {
  if (year < BS_MIN_YEAR || year > BS_MAX_YEAR) {
    throw new BsRangeError(`BS year ${year} is outside ${BS_MIN_YEAR}-${BS_MAX_YEAR}.`);
  }
}

export function adToBs(date: Date): BsDate {
  const { y, m, d } = utcParts(date);
  const nd = new NepaliDateTime(new Date(y, m - 1, d));
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
}

export function bsToAd(bs: BsDate): Date {
  assertInRange(bs.year);
  const nd = new NepaliDateTime(bs.year, bs.month - 1, bs.day);
  const jd = nd.getDateObject();
  return fromUtcParts(jd.getFullYear(), jd.getMonth() + 1, jd.getDate());
}

// Days in a BS month, found by probing downwards — the library throws on an
// invalid day rather than normalising it, and does not export its table.
export function bsMonthLength(year: number, month: number): number {
  assertInRange(year);
  for (let day = 32; day >= 29; day--) {
    try {
      const nd = new NepaliDateTime(year, month - 1, day);
      if (nd.getMonth() === month - 1 && nd.getDate() === day) return day;
    } catch {
      // Day does not exist in this month; try a shorter one.
    }
  }
  throw new BsRangeError(`No valid length for BS ${year}-${month}.`);
}

export function isValidBs(bs: BsDate): boolean {
  if (bs.year < BS_MIN_YEAR || bs.year > BS_MAX_YEAR) return false;
  if (bs.month < 1 || bs.month > 12) return false;
  if (!Number.isInteger(bs.day) || bs.day < 1) return false;
  return bs.day <= bsMonthLength(bs.year, bs.month);
}

export function todayBs(): BsDate {
  const now = new Date();
  return adToBs(fromUtcParts(now.getFullYear(), now.getMonth() + 1, now.getDate()));
}

export function formatBs(date: Date, pattern = "YYYY MMMM DD"): string {
  const { y, m, d } = utcParts(date);
  return new NepaliDateTime(new Date(y, m - 1, d)).format(pattern);
}

// Devanagari digits and month names, for marksheets and printed documents.
export function formatBsNepali(date: Date, pattern = "YYYY MMMM DD"): string {
  const { y, m, d } = utcParts(date);
  return new NepaliDateTime(new Date(y, m - 1, d)).formatNepali(pattern);
}

const pad = (n: number) => String(n).padStart(2, "0");

// "2027-04-13" — the stored Gregorian date, plain, for the displays (an
// academic year's span, a top-bar stamp) that must show the AD dates a BS
// year covers rather than another BS rendering of the same value. formatBs
// converts *to* BS; this is the one place that deliberately does not.
export function formatAd(date: Date): string {
  const { y, m, d } = utcParts(date);
  return `${y}-${pad(m)}-${pad(d)}`;
}

// "2083-05-12" — the wire format for date inputs and form fields.
export function toBsInput(date: Date): string {
  const bs = adToBs(date);
  return `${bs.year}-${pad(bs.month)}-${pad(bs.day)}`;
}

export function parseBsInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const bs = { year: +match[1], month: +match[2], day: +match[3] };
  if (!isValidBs(bs)) return null;
  return bsToAd(bs);
}

/// Steps a BS wire-format date by whole days through Gregorian arithmetic —
/// `Date.UTC` rolls day-of-month overflow/underflow into the next or previous
/// month itself, so this never has to know BS month lengths at all. That is
/// what the raw `day + by` bump in the roll-call UI got wrong: it produced
/// impossible days like "2082-01-32" instead of crossing into Jestha.
export function shiftBsInput(value: string, by: number): string | null {
  const ad = parseBsInput(value);
  if (!ad) return null;
  const { y, m, d } = utcParts(ad);
  const shifted = fromUtcParts(y, m, d + by);
  let bs: BsDate;
  try {
    bs = adToBs(shifted);
  } catch {
    return null; // Outside the range nepali-datetime's conversion table covers.
  }
  // adToBs does not itself enforce BS_MIN_YEAR/BS_MAX_YEAR, so check explicitly
  // rather than trust the library to have thrown already.
  if (!isValidBs(bs)) return null;
  return `${bs.year}-${pad(bs.month)}-${pad(bs.day)}`;
}

// First and last day of a BS year, used to bound an academic year.
export function bsYearRange(year: number): { startsOn: Date; endsOn: Date } {
  assertInRange(year);
  return {
    startsOn: bsToAd({ year, month: 1, day: 1 }),
    endsOn: bsToAd({ year, month: 12, day: bsMonthLength(year, 12) }),
  };
}
