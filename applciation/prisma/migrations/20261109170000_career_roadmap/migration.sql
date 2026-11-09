-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RoadmapGoalStatus" AS ENUM ('OPEN', 'ACHIEVED', 'DROPPED');

-- CreateTable
CREATE TABLE "StudentRoadmap" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "totalSemesters" INTEGER NOT NULL,
    "targetRole" TEXT,
    "careerGoal" TEXT,
    "templateVersion" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentRoadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapMilestone" (
    "id" UUID NOT NULL,
    "roadmapId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "key" TEXT,
    "semester" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "auto" TEXT,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "source" TEXT NOT NULL DEFAULT 'TEMPLATE',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapGoal" (
    "id" UUID NOT NULL,
    "roadmapId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" DATE,
    "status" "RoadmapGoalStatus" NOT NULL DEFAULT 'OPEN',
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapComment" (
    "id" UUID NOT NULL,
    "roadmapId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapEvent" (
    "id" UUID NOT NULL,
    "roadmapId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentRoadmap_studentId_key" ON "StudentRoadmap"("studentId");
CREATE INDEX "StudentRoadmap_collegeId_idx" ON "StudentRoadmap"("collegeId");
CREATE INDEX "RoadmapMilestone_roadmapId_semester_idx" ON "RoadmapMilestone"("roadmapId", "semester");
CREATE INDEX "RoadmapMilestone_collegeId_status_idx" ON "RoadmapMilestone"("collegeId", "status");
CREATE INDEX "RoadmapGoal_roadmapId_idx" ON "RoadmapGoal"("roadmapId");
CREATE INDEX "RoadmapComment_roadmapId_createdAt_idx" ON "RoadmapComment"("roadmapId", "createdAt");
CREATE INDEX "RoadmapEvent_roadmapId_createdAt_idx" ON "RoadmapEvent"("roadmapId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentRoadmap" ADD CONSTRAINT "StudentRoadmap_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapMilestone" ADD CONSTRAINT "RoadmapMilestone_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "StudentRoadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapGoal" ADD CONSTRAINT "RoadmapGoal_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "StudentRoadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapComment" ADD CONSTRAINT "RoadmapComment_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "StudentRoadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapEvent" ADD CONSTRAINT "RoadmapEvent_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "StudentRoadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
