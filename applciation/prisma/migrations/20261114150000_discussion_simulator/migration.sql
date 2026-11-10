-- CreateTable
CREATE TABLE "DiscussionSession" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "stance" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "language" TEXT NOT NULL DEFAULT 'English',
    "durationMin" INTEGER NOT NULL DEFAULT 10,
    "contributionCount" INTEGER NOT NULL DEFAULT 4,
    "participants" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "feedback" JSONB,
    "assignmentId" UUID,
    "voiceConsentAt" TIMESTAMP(3),
    "voiceUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DiscussionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionAssignment" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "language" TEXT NOT NULL DEFAULT 'English',
    "durationMin" INTEGER NOT NULL DEFAULT 10,
    "dueAt" TIMESTAMP(3),
    "targetDepartmentIds" TEXT[],
    "targetBatchIds" TEXT[],
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscussionSession_studentId_createdAt_idx" ON "DiscussionSession"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionSession_assignmentId_idx" ON "DiscussionSession"("assignmentId");

-- CreateIndex
CREATE INDEX "DiscussionAssignment_collegeId_createdAt_idx" ON "DiscussionAssignment"("collegeId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiscussionSession" ADD CONSTRAINT "DiscussionSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionSession" ADD CONSTRAINT "DiscussionSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DiscussionAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

