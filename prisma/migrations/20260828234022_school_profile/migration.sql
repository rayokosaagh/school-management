-- CreateTable
CREATE TABLE "SchoolProfile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "nameNp" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolProfile_logoId_key" ON "SchoolProfile"("logoId");

-- AddForeignKey
ALTER TABLE "SchoolProfile" ADD CONSTRAINT "SchoolProfile_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

