import type { AnnouncementAudience, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { schoolDate } from "@/lib/dashboard/overview";
import { byImportance, visibleTo } from "./visibility";

// Reading and writing staff notices. The rules about who sees what live in
// ./visibility.ts, so this module is only the queries.

export class AnnouncementError extends Error {}

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export type AnnouncementCard = {
  id: number;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  expiresOn: Date | null;
  createdAt: Date;
  author: string | null;
  /// False until this reader opens it. Absence of a row is unread, so a new
  /// account starts with everything still to read rather than nothing.
  read: boolean;
};

function clean(value: unknown, max: number, what: string): string {
  const text = String(value ?? "").trim();
  if (text.length === 0) throw new AnnouncementError(`An announcement needs ${what}.`);
  if (text.length > max) {
    throw new AnnouncementError(`That ${what} is too long — keep it under ${max} characters.`);
  }
  return text;
}

/// The notices one person should see today, in the order they should read them.
///
/// The audience filter is applied in the query rather than after it, so a
/// teacher's dashboard never loads the office's notices into memory on its way
/// to hiding them.
export async function announcementsFor(
  actor: { userId: number; role: Role },
  now = new Date(),
): Promise<AnnouncementCard[]> {
  const today = schoolDate(now);
  const audiences: AnnouncementAudience[] =
    actor.role === "ADMIN" ? ["ALL", "TEACHER", "OFFICE"] : ["ALL", actor.role];

  const rows = await prisma.announcement.findMany({
    where: {
      audience: { in: audiences },
      OR: [{ expiresOn: null }, { expiresOn: { gte: today } }],
    },
    select: {
      id: true, title: true, body: true, audience: true, isPinned: true,
      expiresOn: true, createdAt: true,
      author: { select: { username: true } },
      reads: { where: { userId: actor.userId }, select: { id: true } },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      audience: row.audience,
      isPinned: row.isPinned,
      expiresOn: row.expiresOn,
      createdAt: row.createdAt,
      author: row.author?.username ?? null,
      read: row.reads.length > 0,
    }))
    .sort(byImportance);
}

/// Every notice, current or expired, for the people who manage them. Sorted the
/// same way the dashboard sorts, so the manage list is not a second order to
/// learn.
export async function allAnnouncements(): Promise<AnnouncementCard[]> {
  const rows = await prisma.announcement.findMany({
    select: {
      id: true, title: true, body: true, audience: true, isPinned: true,
      expiresOn: true, createdAt: true,
      author: { select: { username: true } },
    },
  });
  return rows
    .map((row) => ({ ...row, author: row.author?.username ?? null, read: true }))
    .sort(byImportance);
}

export type AnnouncementInput = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  expiresOn: Date | null;
};

export async function createAnnouncement(authorId: number, input: AnnouncementInput) {
  return prisma.announcement.create({
    data: {
      title: clean(input.title, TITLE_MAX, "a title"),
      body: clean(input.body, BODY_MAX, "a message"),
      audience: input.audience,
      isPinned: input.isPinned,
      expiresOn: input.expiresOn,
      authorId,
    },
    select: { id: true, title: true },
  });
}

export async function updateAnnouncement(id: number, input: AnnouncementInput) {
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AnnouncementError("That announcement no longer exists.");

  return prisma.announcement.update({
    where: { id },
    data: {
      title: clean(input.title, TITLE_MAX, "a title"),
      body: clean(input.body, BODY_MAX, "a message"),
      audience: input.audience,
      isPinned: input.isPinned,
      expiresOn: input.expiresOn,
    },
    select: { id: true, title: true },
  });
}

/// Withdraws a notice outright. The read receipts go with it — they are only
/// meaningful alongside the thing they were receipts for.
export async function deleteAnnouncement(id: number) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) throw new AnnouncementError("That announcement no longer exists.");
  await prisma.announcement.delete({ where: { id } });
  return existing;
}

/// Records that somebody has read a notice.
///
/// Idempotent: opening the same notice twice is not an error, and the first
/// read is the one that counts, so a re-read must not move the timestamp.
export async function markRead(announcementId: number, userId: number) {
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: {},
  });
}

/// Marks everything currently visible to this reader as read, for the person
/// who has been away a fortnight and does not want to open eleven notices.
export async function markAllRead(actor: { userId: number; role: Role }, now = new Date()) {
  const visible = await announcementsFor(actor, now);
  const unread = visible.filter((card) => !card.read);
  if (unread.length === 0) return 0;

  await prisma.announcementRead.createMany({
    data: unread.map((card) => ({ announcementId: card.id, userId: actor.userId })),
    skipDuplicates: true,
  });
  return unread.length;
}

/// How many people have seen a notice, for the person who wrote it. Counted
/// rather than listed: the useful question is "has this landed", not "who
/// specifically has not read it yet".
export async function readCounts(ids: number[]): Promise<Record<number, number>> {
  if (ids.length === 0) return {};
  const rows = await prisma.announcementRead.groupBy({
    by: ["announcementId"],
    where: { announcementId: { in: ids } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.announcementId, row._count._all]));
}

export { visibleTo };
