-- CreateEnum
CREATE TYPE "AssessmentCategory" AS ENUM ('APTITUDE', 'TECHNICAL', 'COMMUNICATION', 'DIGITAL_LITERACY', 'TEAMWORK_LEADERSHIP', 'PERSONALITY', 'CAREER_INTEREST', 'BEHAVIOURAL_STYLE', 'OTHER');

-- PsychAttempt: keep every attempt. Existing rows are each student's only attempt, so they stay current.
DROP INDEX "PsychAttempt_studentId_key";
ALTER TABLE "PsychAttempt" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "PsychAttempt_studentId_isCurrent_idx" ON "PsychAttempt"("studentId", "isCurrent");

-- AssessmentPaper: category (existing papers are OTHER until staff tag them)
ALTER TABLE "AssessmentPaper" ADD COLUMN     "category" "AssessmentCategory" NOT NULL DEFAULT 'OTHER';

-- AssessmentAttempt: numbered attempts. Existing rows are attempt 1.
DROP INDEX "AssessmentAttempt_scheduleId_studentId_key";
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "AssessmentAttempt_scheduleId_studentId_attemptNumber_key" ON "AssessmentAttempt"("scheduleId", "studentId", "attemptNumber");
CREATE INDEX "AssessmentAttempt_scheduleId_studentId_idx" ON "AssessmentAttempt"("scheduleId", "studentId");

-- CreateTable
CREATE TABLE "ReassessmentRule" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "category" "AssessmentCategory" NOT NULL,
    "maxAttempts" INTEGER,
    "cooldownDays" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReassessmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReassessmentRule_collegeId_category_key" ON "ReassessmentRule"("collegeId", "category");
