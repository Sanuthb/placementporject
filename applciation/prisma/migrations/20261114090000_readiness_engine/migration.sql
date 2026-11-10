-- CreateTable
CREATE TABLE "ReadinessSnapshot" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "jdId" UUID,
    "scopeKey" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "coverage" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadinessSnapshot_collegeId_scopeKey_idx" ON "ReadinessSnapshot"("collegeId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessSnapshot_studentId_scopeKey_day_key" ON "ReadinessSnapshot"("studentId", "scopeKey", "day");

-- AddForeignKey
ALTER TABLE "ReadinessSnapshot" ADD CONSTRAINT "ReadinessSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
