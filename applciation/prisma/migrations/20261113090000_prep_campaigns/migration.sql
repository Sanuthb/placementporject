-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignMemberStatus" AS ENUM ('SELECTED', 'INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PlanItemKind" AS ENUM ('LEARN', 'COURSE', 'RESOURCE', 'PRACTICE', 'MOCK_TEST', 'MOCK_INTERVIEW', 'REVISION');

-- CreateEnum
CREATE TYPE "PlanItemStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "PrepCampaign" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "jdId" UUID NOT NULL,
    "driveId" UUID,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "jobRole" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" DATE NOT NULL,
    "deadline" DATE NOT NULL,
    "trainerIds" UUID[],
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignGroup" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "trainerId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMember" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "groupId" UUID,
    "status" "CampaignMemberStatus" NOT NULL DEFAULT 'SELECTED',
    "addedManually" BOOLEAN NOT NULL DEFAULT false,
    "scoreAtAdd" INTEGER,
    "gapReport" JSONB,
    "invitedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "helpNote" TEXT,
    "helpRequestedAt" TIMESTAMP(3),
    "helpResponse" TEXT,
    "helpRespondedAt" TIMESTAMP(3),
    "readyMarkedAt" TIMESTAMP(3),
    "readyMarkedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPlanItem" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "kind" "PlanItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "skill" TEXT,
    "refType" TEXT,
    "refId" UUID,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "status" "PlanItemStatus" NOT NULL DEFAULT 'PENDING',
    "doneAt" TIMESTAMP(3),
    "autoDone" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'PLANNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEvent" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "memberId" UUID,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepCampaign_collegeId_status_idx" ON "PrepCampaign"("collegeId", "status");

-- CreateIndex
CREATE INDEX "PrepCampaign_jdId_idx" ON "PrepCampaign"("jdId");

-- CreateIndex
CREATE INDEX "CampaignGroup_campaignId_idx" ON "CampaignGroup"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMember_studentId_idx" ON "CampaignMember"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMember_campaignId_studentId_key" ON "CampaignMember"("campaignId", "studentId");

-- CreateIndex
CREATE INDEX "CampaignPlanItem_memberId_dueAt_idx" ON "CampaignPlanItem"("memberId", "dueAt");

-- CreateIndex
CREATE INDEX "CampaignPlanItem_campaignId_idx" ON "CampaignPlanItem"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignEvent_campaignId_createdAt_idx" ON "CampaignEvent"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "PrepCampaign" ADD CONSTRAINT "PrepCampaign_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "JobDescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignGroup" ADD CONSTRAINT "CampaignGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PrepCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PrepCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CampaignGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlanItem" ADD CONSTRAINT "CampaignPlanItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PrepCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlanItem" ADD CONSTRAINT "CampaignPlanItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CampaignMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PrepCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

