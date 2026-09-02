-- Subject.code is removed: it was a second unique identifier that only
-- produced duplicate-key errors on insert. The id is the key, and name is
-- now unique so two subjects cannot share one.
--
-- The codes this dropped, recorded because the column cannot be recovered:
--   Art and Craft=ART
--   Compulsory Math=CMATH
--   Computer=COMPUTER
--   English=ENGLISH
--   General Knowledge=GK
--   Health and Environment=HEALTH-ENV
--   Health and Physical Education=HPE
--   Moral Education=MORAL
--   Nepali=NEPALI
--   Occupation, Business and Technology=OBTE
--   Optional Math=OPTMATH
--   Our Surroundings=SURR
--   Science=SCIENCE
--   Science and Technology=SCITECH
--   Social Studies=S-STUDIES

-- DropIndex
DROP INDEX "Subject_code_key";

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "code";

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

