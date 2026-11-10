-- CreateEnum
CREATE TYPE "ResumeKind" AS ENUM ('MASTER', 'TECHNICAL', 'MANAGEMENT', 'INTERNSHIP', 'FRESHER', 'PROJECT_BASED', 'COMPANY_SPECIFIC');

-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ResumeKind" NOT NULL DEFAULT 'MASTER',
    "template" TEXT NOT NULL DEFAULT 'ATS',
    "targetCompany" TEXT,
    "targetRole" TEXT,
    "targetText" TEXT,
    "edits" JSONB NOT NULL DEFAULT '{}',
    "verifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "markEvidence" BOOLEAN NOT NULL DEFAULT true,
    "status" "ResumeStatus" NOT NULL DEFAULT 'DRAFT',
    "doc" JSONB,
    "profileKeys" TEXT[],
    "approvedAt" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeVersion_studentId_status_idx" ON "ResumeVersion"("studentId", "status");

-- CreateIndex
CREATE INDEX "ResumeVersion_collegeId_idx" ON "ResumeVersion"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_studentId_number_key" ON "ResumeVersion"("studentId", "number");

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

