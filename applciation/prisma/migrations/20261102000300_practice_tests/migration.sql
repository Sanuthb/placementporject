ALTER TABLE "Question" ADD COLUMN "explanation" TEXT;
ALTER TABLE "AssessmentSchedule" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
