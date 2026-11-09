-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PASS', 'FAIL', 'WITHHELD', 'ONGOING');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('FAILED', 'CLEARED');

-- AlterTable
ALTER TABLE "StudentEducationRecord" ADD COLUMN     "pendingData" JSONB,
ADD COLUMN     "reviewComment" TEXT,
ADD COLUMN     "reviewStatus" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" UUID;

-- CreateTable
CREATE TABLE "SemesterResult" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "semesterId" UUID,
    "semesterNumber" INTEGER NOT NULL,
    "sgpa" DECIMAL(4,2),
    "resultStatus" "ResultStatus" NOT NULL DEFAULT 'PASS',
    "reviewStatus" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewComment" TEXT,
    "pendingData" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemesterResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectMark" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "semesterResultId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "marksObtained" DECIMAL(7,2) NOT NULL,
    "maxMarks" DECIMAL(7,2) NOT NULL,
    "credits" DECIMAL(4,1),
    "grade" TEXT,
    "gradePoints" DECIMAL(4,2),

    CONSTRAINT "SubjectMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backlog" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "subjectName" TEXT NOT NULL,
    "subjectCode" TEXT,
    "semesterNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklogAttempt" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "backlogId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "examSession" TEXT,
    "marksObtained" DECIMAL(7,2),
    "outcome" "AttemptOutcome" NOT NULL,
    "clearedInSemester" INTEGER,
    "reviewStatus" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewComment" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacklogAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SemesterResult_collegeId_studentId_idx" ON "SemesterResult"("collegeId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterResult_studentId_semesterNumber_key" ON "SemesterResult"("studentId", "semesterNumber");

-- CreateIndex
CREATE INDEX "SubjectMark_semesterResultId_idx" ON "SubjectMark"("semesterResultId");

-- CreateIndex
CREATE INDEX "Backlog_collegeId_studentId_idx" ON "Backlog"("collegeId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Backlog_studentId_semesterNumber_subjectName_key" ON "Backlog"("studentId", "semesterNumber", "subjectName");

-- CreateIndex
CREATE UNIQUE INDEX "BacklogAttempt_backlogId_attemptNumber_key" ON "BacklogAttempt"("backlogId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "SemesterResult" ADD CONSTRAINT "SemesterResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemesterResult" ADD CONSTRAINT "SemesterResult_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectMark" ADD CONSTRAINT "SubjectMark_semesterResultId_fkey" FOREIGN KEY ("semesterResultId") REFERENCES "SemesterResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backlog" ADD CONSTRAINT "Backlog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklogAttempt" ADD CONSTRAINT "BacklogAttempt_backlogId_fkey" FOREIGN KEY ("backlogId") REFERENCES "Backlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: an existing education record takes the review state of the student's EDUCATION_HISTORY section, so students who are
-- already verified stay verified. Nothing is deleted or rewritten except this new column.
UPDATE "StudentEducationRecord" r
SET "reviewStatus" = s."status",
    "verifiedAt" = CASE WHEN s."status" = 'VERIFIED' THEN s."reviewedAt" END
FROM "StudentSection" s
WHERE s."studentId" = r."studentId" AND s."section" = 'EDUCATION_HISTORY' AND s."status" IN ('SUBMITTED', 'VERIFIED', 'CHANGES_REQUESTED');
