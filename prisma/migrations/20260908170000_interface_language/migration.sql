-- Existing schools keep the English interface until an administrator chooses
-- Nepali from Settings.
ALTER TABLE "SchoolProfile"
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en',
ADD CONSTRAINT "SchoolProfile_language_check" CHECK ("language" IN ('en', 'ne'));
