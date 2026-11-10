-- AlterTable
ALTER TABLE "MockInterview" ADD COLUMN     "assignmentId" UUID,
ADD COLUMN     "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "durationMin" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "jdId" UUID,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'English',
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'LEARNING',
ADD COLUMN     "questionCount" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TECHNICAL',
ADD COLUMN     "voiceConsentAt" TIMESTAMP(3),
ADD COLUMN     "voiceUsed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InterviewAssignment" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "durationMin" INTEGER NOT NULL DEFAULT 20,
    "language" TEXT NOT NULL DEFAULT 'English',
    "role" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "jdId" UUID,
    "dueAt" TIMESTAMP(3),
    "targetStudentIds" TEXT[],
    "targetDepartmentIds" TEXT[],
    "targetBatchIds" TEXT[],
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewAssignment_collegeId_createdAt_idx" ON "InterviewAssignment"("collegeId", "createdAt");

-- CreateIndex
CREATE INDEX "MockInterview_assignmentId_idx" ON "MockInterview"("assignmentId");

-- AddForeignKey
ALTER TABLE "MockInterview" ADD CONSTRAINT "MockInterview_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "InterviewAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
