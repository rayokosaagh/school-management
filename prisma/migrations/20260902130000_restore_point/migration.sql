-- CreateTable
CREATE TABLE "RestorePoint" (
    "id" SERIAL NOT NULL,
    "yearNameBS" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    "counts" JSONB NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RestorePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestorePoint_createdAt_idx" ON "RestorePoint"("createdAt");

-- AddForeignKey
ALTER TABLE "RestorePoint" ADD CONSTRAINT "RestorePoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
