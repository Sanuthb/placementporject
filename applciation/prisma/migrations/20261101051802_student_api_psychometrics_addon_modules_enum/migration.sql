-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'ASSESSMENTS';
ALTER TYPE "ModuleKey" ADD VALUE 'EMPLOYER_CRM';
ALTER TYPE "ModuleKey" ADD VALUE 'STUDENT_PREP';
ALTER TYPE "ModuleKey" ADD VALUE 'INTERNSHIPS';
ALTER TYPE "ModuleKey" ADD VALUE 'EVENTS';
ALTER TYPE "ModuleKey" ADD VALUE 'LEARNING';
ALTER TYPE "ModuleKey" ADD VALUE 'RECRUITER_PORTAL';
ALTER TYPE "ModuleKey" ADD VALUE 'TALENT_SHOWCASE';

-- AlterTable
ALTER TABLE "RoundResult" ALTER COLUMN "recordedById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PsychAttempt" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsychAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsychAccessLog" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsychAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PsychAttempt_studentId_key" ON "PsychAttempt"("studentId");

-- CreateIndex
CREATE INDEX "PsychAttempt_collegeId_completedAt_idx" ON "PsychAttempt"("collegeId", "completedAt");

-- CreateIndex
CREATE INDEX "PsychAccessLog_collegeId_createdAt_idx" ON "PsychAccessLog"("collegeId", "createdAt");

-- CreateIndex
CREATE INDEX "PsychAccessLog_studentId_idx" ON "PsychAccessLog"("studentId");

-- AddForeignKey
ALTER TABLE "PsychAttempt" ADD CONSTRAINT "PsychAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
