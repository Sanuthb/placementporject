-- CreateTable
CREATE TABLE "StudentIntelligenceReport" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "inputHash" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "narrative" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentIntelligenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentIntelligenceReport_studentId_createdAt_idx" ON "StudentIntelligenceReport"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentIntelligenceReport_collegeId_idx" ON "StudentIntelligenceReport"("collegeId");

-- AddForeignKey
ALTER TABLE "StudentIntelligenceReport" ADD CONSTRAINT "StudentIntelligenceReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentIntelligenceReport" ENABLE ROW LEVEL SECURITY;
