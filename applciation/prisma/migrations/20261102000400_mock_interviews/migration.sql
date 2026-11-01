-- CreateTable
CREATE TABLE "MockInterview" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "feedback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MockInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockInterview_studentId_createdAt_idx" ON "MockInterview"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "MockInterview" ADD CONSTRAINT "MockInterview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lock-down as every other table: reachable only through the app server.
ALTER TABLE "MockInterview" ENABLE ROW LEVEL SECURITY;
