-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('DONE', 'FAILED');

-- AlterTable
ALTER TABLE "CollegeSettings" ADD COLUMN     "aiDocumentReading" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "status" "ExtractionStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "fields" JSONB,
    "suggestions" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentExtraction_documentId_createdAt_idx" ON "DocumentExtraction"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentExtraction_collegeId_studentId_idx" ON "DocumentExtraction"("collegeId", "studentId");

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
