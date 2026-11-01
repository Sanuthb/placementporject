-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('MANUAL', 'CODE', 'AUTO_CLOSE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlockPolicyType" AS ENUM ('MISSED_DRIVES', 'PLACED_LOWER_TIER');

-- CreateEnum
CREATE TYPE "BlockSource" AS ENUM ('POLICY', 'MANUAL');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('ACTIVE', 'LIFTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AlertEventKind" AS ENUM ('VIEW', 'CLICK');

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_driveId_fkey";

-- AlterTable
ALTER TABLE "MessageLog" ALTER COLUMN "sentById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "isHistorical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offerYear" INTEGER,
ALTER COLUMN "applicationId" DROP NOT NULL,
ALTER COLUMN "driveId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "roundId" UUID,
    "roundKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "roundId" UUID,
    "roundKey" TEXT NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "method" "CheckInMethod" NOT NULL,
    "excused" BOOLEAN NOT NULL DEFAULT false,
    "excuseReason" TEXT,
    "markedById" UUID,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPanel" (
    "id" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSlot" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "panelId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockPolicy" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "type" "BlockPolicyType" NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "source" "BlockSource" NOT NULL,
    "policyId" UUID,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "BlockStatus" NOT NULL DEFAULT 'ACTIVE',
    "evidence" JSONB,
    "createdById" UUID,
    "liftedById" UUID,
    "liftReason" TEXT,
    "liftedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAlert" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "applyUrl" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "targetDepartmentIds" UUID[],
    "targetBatchIds" UUID[],
    "targetSkills" TEXT[],
    "status" "AlertStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAlertEvent" (
    "id" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "kind" "AlertEventKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSession_driveId_roundKey_key" ON "AttendanceSession"("driveId", "roundKey");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_status_idx" ON "AttendanceRecord"("studentId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_collegeId_status_idx" ON "AttendanceRecord"("collegeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_driveId_roundKey_studentId_key" ON "AttendanceRecord"("driveId", "roundKey", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPanel_driveId_name_key" ON "InterviewPanel"("driveId", "name");

-- CreateIndex
CREATE INDEX "InterviewSlot_panelId_startsAt_idx" ON "InterviewSlot"("panelId", "startsAt");

-- CreateIndex
CREATE INDEX "InterviewSlot_applicationId_idx" ON "InterviewSlot"("applicationId");

-- CreateIndex
CREATE INDEX "InterviewSlot_driveId_roundId_idx" ON "InterviewSlot"("driveId", "roundId");

-- CreateIndex
CREATE INDEX "BlockPolicy_collegeId_isActive_idx" ON "BlockPolicy"("collegeId", "isActive");

-- CreateIndex
CREATE INDEX "Block_collegeId_status_endsAt_idx" ON "Block"("collegeId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "Block_studentId_status_idx" ON "Block"("studentId", "status");

-- CreateIndex
CREATE INDEX "JobAlert_collegeId_status_idx" ON "JobAlert"("collegeId", "status");

-- CreateIndex
CREATE INDEX "JobAlertEvent_alertId_kind_idx" ON "JobAlertEvent"("alertId", "kind");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPanel" ADD CONSTRAINT "InterviewPanel_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DriveRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "InterviewPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAlertEvent" ADD CONSTRAINT "JobAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "JobAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
