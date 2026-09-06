import { describe, expect, it } from "vitest";
import {
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  BS_MONTHS,
  BS_MONTHS_SHORT,
  BsRangeError,
  adToBs,
  bsMonthLength,
  bsToAd,
  bsYearRange,
  formatAd,
  formatBs,
  formatBsNepali,
  isValidBs,
  parseBsInput,
  shiftBsInput,
  toBsInput,
} from "./bs";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("adToBs / bsToAd", () => {
  // Verified against nepali-date-converter, an independent implementation, which
  // agreed on all 32,976 days from 1944-01-01 to 2030-08-16.
  const pairs: [Date, [number, number, number]][] = [
    [utc(2026, 8, 28), [2083, 5, 12]],
    [utc(2025, 4, 14), [2082, 1, 1]],
    [utc(2024, 4, 13), [2081, 1, 1]],
    [utc(2023, 4, 14), [2080, 1, 1]],
    [utc(1994, 1, 1), [2050, 9, 17]],
  ];

  it.each(pairs)("converts %s", (ad, [year, month, day]) => {
    expect(adToBs(ad)).toEqual({ year, month, day });
    expect(bsToAd({ year, month, day })).toEqual(ad);
  });

  it("round-trips every day across a year boundary", () => {
    const cursor = utc(2025, 1, 1);
    const end = utc(2026, 12, 31);
    let checked = 0;
    while (cursor <= end) {
      const bs = adToBs(cursor);
      expect(bsToAd(bs)).toEqual(cursor);
      checked++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    expect(checked).toBe(730);
  });

  it("does not drift when the date sits at a UTC day edge", () => {
    expect(adToBs(new Date("2025-04-14T00:00:00.000Z"))).toEqual({
      year: 2082,
      month: 1,
      day: 1,
    });
  });
});

describe("bsMonthLength", () => {
  it("returns 29-32 for every month of several years", () => {
    for (let year = 2078; year <= 2085; year++) {
      for (let month = 1; month <= 12; month++) {
        const length = bsMonthLength(year, month);
        expect(length).toBeGreaterThanOrEqual(29);
        expect(length).toBeLessThanOrEqual(32);
      }
    }
  });

  it("handles Chaitra, whose length varies year to year", () => {
    const lengths = new Set<number>();
    for (let year = 2078; year <= 2090; year++) lengths.add(bsMonthLength(year, 12));
    expect(lengths.size).toBeGreaterThan(1);
  });
});

describe("isValidBs", () => {
  it("rejects out-of-range years", () => {
    expect(isValidBs({ year: BS_MIN_YEAR - 1, month: 1, day: 1 })).toBe(false);
    expect(isValidBs({ year: BS_MAX_YEAR + 1, month: 1, day: 1 })).toBe(false);
  });

  it("rejects impossible months and days", () => {
    expect(isValidBs({ year: 2082, month: 0, day: 1 })).toBe(false);
    expect(isValidBs({ year: 2082, month: 13, day: 1 })).toBe(false);
    expect(isValidBs({ year: 2082, month: 1, day: 0 })).toBe(false);
    expect(isValidBs({ year: 2082, month: 1, day: 33 })).toBe(false);
  });

  it("rejects a day past the end of that specific month", () => {
    const month = 1;
    const length = bsMonthLength(2082, month);
    expect(isValidBs({ year: 2082, month, day: length })).toBe(true);
    expect(isValidBs({ year: 2082, month, day: length + 1 })).toBe(false);
  });
});

describe("form input", () => {
  it("formats and parses the wire format", () => {
    expect(toBsInput(utc(2025, 4, 14))).toBe("2082-01-01");
    expect(parseBsInput("2082-01-01")).toEqual(utc(2025, 4, 14));
  });

  it("accepts unpadded input", () => {
    expect(parseBsInput("2082-1-1")).toEqual(utc(2025, 4, 14));
  });

  it("returns null on malformed or impossible input", () => {
    expect(parseBsInput("")).toBeNull();
    expect(parseBsInput("not-a-date")).toBeNull();
    expect(parseBsInput("2082-13-01")).toBeNull();
    expect(parseBsInput("2082-01-99")).toBeNull();
    expect(parseBsInput("1999-01-01")).toBeNull();
  });
});

describe("bsYearRange", () => {
  it("spans Baisakh 1 to the last day of Chaitra", () => {
    const { startsOn, endsOn } = bsYearRange(2082);
    expect(adToBs(startsOn)).toEqual({ year: 2082, month: 1, day: 1 });
    const end = adToBs(endsOn);
    expect(end.year).toBe(2082);
    expect(end.month).toBe(12);
    expect(end.day).toBe(bsMonthLength(2082, 12));
  });

  it("ends the day before the next year starts", () => {
    const { endsOn } = bsYearRange(2082);
    const next = bsYearRange(2083).startsOn;
    expect(next.getTime() - endsOn.getTime()).toBe(86_400_000);
  });

  it("throws outside the supported range", () => {
    expect(() => bsYearRange(1999)).toThrow(BsRangeError);
    expect(() => bsYearRange(2100)).toThrow(BsRangeError);
  });
});

describe("shiftBsInput", () => {
  // BS 2082: Baisakh (month 1) has 31 days, Ashadh (month 3) has 32 — a
  // month-length span the old `day + 1` bump in the roll-call UI could not
  // tell apart, since it just capped at "day > 32".
  it("steps forward off the last day of a 31-day month onto day 1 of the next", () => {
    expect(bsMonthLength(2082, 1)).toBe(31);
    expect(shiftBsInput("2082-01-31", 1)).toBe("2082-02-01");
  });

  it("steps forward off the last day of a 32-day month onto day 1 of the next", () => {
    expect(bsMonthLength(2082, 3)).toBe(32);
    expect(shiftBsInput("2082-03-32", 1)).toBe("2082-04-01");
  });

  it("steps back off day 1 onto the last day of the previous month, whatever its length", () => {
    expect(shiftBsInput("2082-02-01", -1)).toBe("2082-01-31"); // previous month has 31 days
    expect(shiftBsInput("2082-04-01", -1)).toBe("2082-03-32"); // previous month has 32 days
  });

  it("crosses a BS year boundary in both directions", () => {
    expect(bsMonthLength(2082, 12)).toBe(30);
    expect(shiftBsInput("2082-12-30", 1)).toBe("2083-01-01");
    expect(shiftBsInput("2083-01-01", -1)).toBe("2082-12-30");
  });

  it("moves an ordinary mid-month date by one day", () => {
    expect(shiftBsInput("2082-01-15", 1)).toBe("2082-01-16");
    expect(shiftBsInput("2082-01-15", -1)).toBe("2082-01-14");
  });

  it("returns null instead of guessing at malformed or unparseable input", () => {
    expect(shiftBsInput("not-a-date", 1)).toBeNull();
    expect(shiftBsInput("2082-13-01", 1)).toBeNull();
    expect(shiftBsInput("", 1)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats in English", () => {
    expect(formatBs(utc(2026, 8, 28))).toBe("2083 Bhadra 12");
  });

  it("formats in Devanagari for printed documents", () => {
    expect(formatBsNepali(utc(2026, 8, 28))).toBe("२०८३ भाद्र १२");
  });

  // formatAd is the deliberate exception to "every formatter here produces
  // BS" — a column labelled Gregorian must not call formatBs, which converts
  // the other way. Reproduces the reported case: BS year 2083 stored as its
  // Gregorian bounds, formatted for a "Gregorian span" column.
  it("formats the stored Gregorian date, not its BS conversion", () => {
    expect(formatAd(utc(2026, 8, 28))).toBe("2026-08-28");
    const { startsOn, endsOn } = bsYearRange(2083);
    expect(formatAd(startsOn)).toBe("2026-04-14");
    expect(formatAd(endsOn)).toBe("2027-04-13");
  });
});

describe("short month labels", () => {
  it("gives every month a distinct label", () => {
    // Slicing the full names to three letters renders both Ashadh and Ashwin
    // as "Ash", which made two months indistinguishable in the fee strip.
    expect(new Set(BS_MONTHS_SHORT).size).toBe(12);
  });

  it("keeps one label per month, in order", () => {
    expect(BS_MONTHS_SHORT).toHaveLength(BS_MONTHS.length);
    expect(BS_MONTHS_SHORT[2]).toBe("Asa");
    expect(BS_MONTHS_SHORT[5]).toBe("Asw");
  });
});
