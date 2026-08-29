-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OFFICE', 'TEACHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'OFFICE';


-- Existing accounts predate roles and are the school's own logins; making them
-- OFFICE would lock everybody out of Settings and account management.
UPDATE "User" SET "role" = 'ADMIN';
