-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "marks" JSONB,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "AssessmentPaper" ADD COLUMN     "jdId" UUID,
ADD COLUMN     "sectionCutoffs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "testKind" TEXT;

-- AlterTable
ALTER TABLE "AssessmentSchedule" ADD COLUMN     "maxAttempts" INTEGER,
ADD COLUMN     "resultVisibility" TEXT,
ADD COLUMN     "targetStudentIds" UUID[];

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "acceptedAnswers" TEXT[],
ADD COLUMN     "context" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "modelAnswer" TEXT,
ADD COLUMN     "rubric" TEXT,
ADD COLUMN     "section" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'CHOICE';

-- CreateTable
CREATE TABLE "TestImprovement" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "weakTopics" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "practiceScheduleId" UUID,
    "reassessAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestImprovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestImprovement_attemptId_key" ON "TestImprovement"("attemptId");

-- CreateIndex
CREATE INDEX "TestImprovement_studentId_idx" ON "TestImprovement"("studentId");

-- AddForeignKey
ALTER TABLE "TestImprovement" ADD CONSTRAINT "TestImprovement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

