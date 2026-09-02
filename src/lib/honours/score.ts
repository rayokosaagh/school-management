import type { ActivityLevel } from "@/generated/prisma/enums";

// The honours score, as pure arithmetic. Every pillar is 0..100 or null for
// "no data"; the loader in ./honours.ts gathers the inputs and this file
// decides what they are worth. Kept free of Prisma so it can be tested cold.

export type Weights = {
  exams: number;
  attendance: number;
  conduct: number;
  activities: number;
};

export type Pillars = {
  /// Mean overall percent across published, complete terms. Null without one.
  exams: number | null;
  /// Attendance percent for the year. Null when no roll call includes them.
  attendance: number | null;
  /// Always present: no entries is a score, not a gap.
  conduct: number;
  activities: number;
};

export const DEFAULT_WEIGHTS: Weights = { exams: 50, attendance: 20, conduct: 15, activities: 15 };

/// What a student with no conduct entries scores. Below 100 so a merit can
/// lift them above the crowd, high enough that a clean year still counts.
export const CONDUCT_BASE = 80;

/// The points the activity form pre-fills for each level.
export const ACTIVITY_POINTS: Record<ActivityLevel, number> = {
  PARTICIPATED: 10,
  PLACED: 20,
  WON: 30,
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function examScore(percents: (number | null)[]): number | null {
  const done = percents.filter((p): p is number => p !== null);
  if (done.length === 0) return null;
  return done.reduce((sum, p) => sum + p, 0) / done.length;
}

export function conductScore(merits: number, demerits: number): number {
  return clamp(CONDUCT_BASE + merits - demerits);
}

export function activityScore(points: number): number {
  return clamp(points);
}

/// Weighted mean over the pillars that have data. Exams are required — a
/// ranking without a published result is a guess — but a missing attendance
/// record only drops that weight, so a new arrival is not scored as absent.
export function overallScore(p: Pillars, w: Weights): number | null {
  if (p.exams === null) return null;

  let sum = w.exams * p.exams + w.conduct * p.conduct + w.activities * p.activities;
  let total = w.exams + w.conduct + w.activities;
  if (p.attendance !== null) {
    sum += w.attendance * p.attendance;
    total += w.attendance;
  }
  if (total === 0) return null;

  return Math.round((sum / total) * 10) / 10;
}

/// Null when the set is usable, otherwise the message to show.
export function validateWeights(w: Weights): string | null {
  const values = [w.exams, w.attendance, w.conduct, w.activities];
  if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) {
    return "Each weight must be a whole number from 0 to 100.";
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum !== 100) return `Weights must add up to 100 (currently ${sum}).`;
  return null;
}

/// 1 → "1st", 12 → "12th", 23 → "23rd".
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
