-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('INDIVIDUAL', 'TEAM', 'INTERDISCIPLINARY');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROPOSED', 'DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('FORMING', 'ACTIVE', 'SUBMITTED', 'EVALUATED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "ReviewerType" AS ENUM ('FACULTY', 'INDUSTRY', 'STAFF');

-- CreateEnum
CREATE TYPE "ProjectFileKind" AS ENUM ('DOCUMENT', 'PRESENTATION');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "skills" TEXT[],
    "type" "ProjectType" NOT NULL DEFAULT 'TEAM',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "minTeamSize" INTEGER NOT NULL DEFAULT 1,
    "maxTeamSize" INTEGER NOT NULL DEFAULT 1,
    "departmentIds" UUID[],
    "batchIds" UUID[],
    "guideId" UUID,
    "industryPartner" TEXT,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "selfFormTeams" BOOLEAN NOT NULL DEFAULT true,
    "maxTeams" INTEGER,
    "milestoneTemplate" JSONB NOT NULL DEFAULT '[]',
    "proposedById" UUID,
    "createdById" UUID,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTeam" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" UUID NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'FORMING',
    "summary" TEXT,
    "repoUrl" TEXT,
    "repoStats" JSONB,
    "repoSyncedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "finalPercent" INTEGER,
    "resultPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "githubUsername" TEXT,
    "role" TEXT,
    "showInPortfolio" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "milestoneId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByStudentId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUpdate" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "studentId" UUID,
    "authorUserId" UUID,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "kind" "ProjectFileKind" NOT NULL,
    "title" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByStudentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReview" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "reviewerType" "ReviewerType" NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerUserId" UUID,
    "inviteId" UUID,
    "comments" TEXT,
    "scores" JSONB NOT NULL,
    "individualMarks" JSONB NOT NULL DEFAULT '{}',
    "percent" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMentorInvite" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMentorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_collegeId_status_idx" ON "Project"("collegeId", "status");

-- CreateIndex
CREATE INDEX "ProjectTeam_projectId_idx" ON "ProjectTeam"("projectId");

-- CreateIndex
CREATE INDEX "ProjectTeam_collegeId_idx" ON "ProjectTeam"("collegeId");

-- CreateIndex
CREATE INDEX "ProjectMember_studentId_idx" ON "ProjectMember"("studentId");

-- CreateIndex
CREATE INDEX "ProjectMember_teamId_idx" ON "ProjectMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_studentId_key" ON "ProjectMember"("projectId", "studentId");

-- CreateIndex
CREATE INDEX "ProjectMilestone_teamId_idx" ON "ProjectMilestone"("teamId");

-- CreateIndex
CREATE INDEX "ProjectTask_teamId_idx" ON "ProjectTask"("teamId");

-- CreateIndex
CREATE INDEX "ProjectUpdate_teamId_createdAt_idx" ON "ProjectUpdate"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectFile_teamId_idx" ON "ProjectFile"("teamId");

-- CreateIndex
CREATE INDEX "ProjectReview_teamId_idx" ON "ProjectReview"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMentorInvite_tokenHash_key" ON "ProjectMentorInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ProjectMentorInvite_teamId_idx" ON "ProjectMentorInvite"("teamId");

-- AddForeignKey
ALTER TABLE "ProjectTeam" ADD CONSTRAINT "ProjectTeam_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMentorInvite" ADD CONSTRAINT "ProjectMentorInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProjectTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

