-- CreateEnum
CREATE TYPE "JdStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JdSource" AS ENUM ('UPLOAD', 'PASTE', 'MANUAL');

-- CreateTable
CREATE TABLE "JobDescription" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "driveId" UUID,
    "companyId" UUID,
    "source" "JdSource" NOT NULL,
    "status" "JdStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "rawText" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" JSONB NOT NULL,
    "extractionNotes" TEXT[],
    "extractedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDescription_driveId_key" ON "JobDescription"("driveId");

-- CreateIndex
CREATE INDEX "JobDescription_collegeId_status_idx" ON "JobDescription"("collegeId", "status");

-- AddForeignKey
ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

