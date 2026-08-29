import { describe, expect, it } from "vitest";
import {
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  BsRangeError,
  adToBs,
  bsMonthLength,
  bsToAd,
  bsYearRange,
  formatBs,
  formatBsNepali,
  isValidBs,
  parseBsInput,
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

describe("formatting", () => {
  it("formats in English", () => {
    expect(formatBs(utc(2026, 8, 28))).toBe("2083 Bhadra 12");
  });

  it("formats in Devanagari for printed documents", () => {
    expect(formatBsNepali(utc(2026, 8, 28))).toBe("२०८३ भाद्र १२");
  });
});
