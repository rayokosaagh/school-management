-- Announcements are additive: two new tables and one enum, with no change to
-- any existing row or column.
--
-- The author link is nullable and cleared rather than cascading: a notice
-- outlives the person who wrote it, and losing the notice when an account is
-- closed would be the worse loss. Read receipts do cascade — they mean nothing
-- without the thing they were receipts for.
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'TEACHER', 'OFFICE');

CREATE TABLE "Announcement" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  -- Date-only, like every other school date. NULL means it never expires.
  "expiresOn" DATE,
  "authorId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- The dashboard's only read: the notices for one role that have not expired.
CREATE INDEX "Announcement_audience_expiresOn_idx" ON "Announcement"("audience", "expiresOn");

CREATE TABLE "AnnouncementRead" (
  "id" SERIAL PRIMARY KEY,
  "announcementId" INTEGER NOT NULL REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One receipt per person per notice. The absence of a row is what "unread"
-- means, so this must be the only shape a receipt can take.
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");
