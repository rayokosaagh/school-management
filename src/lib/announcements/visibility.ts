import type { AnnouncementAudience, Role } from "@/generated/prisma/enums";

// The rules about who sees a notice and for how long, with no database behind
// them, so both the server query and the tests agree on one reading.

/// Whether a notice written for `audience` reaches somebody in `role`.
///
/// Administrators see every notice, including the ones addressed only to
/// teachers or only to the office. They are the people who write and withdraw
/// them, and a notice an administrator cannot see is one they cannot correct.
export function visibleTo(role: Role, audience: AnnouncementAudience): boolean {
  if (audience === "ALL") return true;
  if (role === "ADMIN") return true;
  return audience === role;
}

/// Whether a notice is still current on `today`.
///
/// Expiry is inclusive: a notice that expires today is still readable today.
/// Somebody setting "expires on the last day of term" means the last day of
/// term to be the last day it shows, not the day it vanishes.
export function isLive(
  announcement: { expiresOn: Date | null },
  today: Date,
): boolean {
  return announcement.expiresOn === null || announcement.expiresOn >= today;
}

/// Pinned first, then newest. The order the dashboard reads them in.
///
/// A stable comparison rather than a date subtraction on equal dates: two
/// notices posted in the same second must not swap places between renders.
export function byImportance<T extends { isPinned: boolean; createdAt: Date; id: number }>(
  a: T,
  b: T,
): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  return byDate !== 0 ? byDate : b.id - a.id;
}

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: "Everyone",
  TEACHER: "Teachers",
  OFFICE: "Office",
};

/// What the audience means, in the compose form where the choice is made.
export const AUDIENCE_NOTE: Record<AnnouncementAudience, string> = {
  ALL: "Every member of staff who can sign in.",
  TEACHER: "Teaching staff only.",
  OFFICE: "Office staff only.",
};
