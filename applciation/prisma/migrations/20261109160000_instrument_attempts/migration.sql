-- CreateTable
CREATE TABLE "InstrumentAttempt" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "instrumentKey" TEXT NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InstrumentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentAttempt_studentId_instrumentKey_attemptNumber_key" ON "InstrumentAttempt"("studentId", "instrumentKey", "attemptNumber");
CREATE INDEX "InstrumentAttempt_collegeId_instrumentKey_isCurrent_idx" ON "InstrumentAttempt"("collegeId", "instrumentKey", "isCurrent");
CREATE INDEX "InstrumentAttempt_studentId_instrumentKey_idx" ON "InstrumentAttempt"("studentId", "instrumentKey");

-- AddForeignKey
ALTER TABLE "InstrumentAttempt" ADD CONSTRAINT "InstrumentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
