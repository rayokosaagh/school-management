-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "photoId" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "photoId" INTEGER;

-- CreateTable
CREATE TABLE "Photo" (
    "id" SERIAL NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_photoId_key" ON "Staff"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_photoId_key" ON "Student"("photoId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: split any existing fullName into parts so no row is left nameless.
UPDATE "Student" s SET
  "firstName"  = x.parts[1],
  "lastName"   = CASE WHEN x.n > 1 THEN x.parts[x.n] ELSE '' END,
  "middleName" = CASE WHEN x.n > 2 THEN array_to_string(x.parts[2:x.n-1], ' ') ELSE NULL END
FROM (
  SELECT id,
         string_to_array(btrim("fullName"), ' ') AS parts,
         array_length(string_to_array(btrim("fullName"), ' '), 1) AS n
  FROM "Student"
) x
WHERE s.id = x.id AND s."firstName" = '' AND x.n >= 1;

UPDATE "Staff" s SET
  "firstName"  = x.parts[1],
  "lastName"   = CASE WHEN x.n > 1 THEN x.parts[x.n] ELSE '' END,
  "middleName" = CASE WHEN x.n > 2 THEN array_to_string(x.parts[2:x.n-1], ' ') ELSE NULL END
FROM (
  SELECT id,
         string_to_array(btrim("fullName"), ' ') AS parts,
         array_length(string_to_array(btrim("fullName"), ' '), 1) AS n
  FROM "Staff"
) x
WHERE s.id = x.id AND s."firstName" = '' AND x.n >= 1;
