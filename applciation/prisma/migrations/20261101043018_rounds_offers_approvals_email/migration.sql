-- CreateEnum
CREATE TYPE "RoundResultStatus" AS ENUM ('ATTENDED', 'ABSENT', 'CLEARED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "JoiningStatus" AS ENUM ('PENDING', 'JOINED', 'NOT_JOINED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('OFFER_CREATE', 'BULK_EMAIL', 'BULK_STATUS_CHANGE', 'ELIGIBILITY_EXCEPTION');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "clearedAllRounds" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentRound" INTEGER;

-- AlterTable
ALTER TABLE "ApplicationEvent" ADD COLUMN     "roundId" UUID,
ADD COLUMN     "roundResult" "RoundResultStatus",
ALTER COLUMN "status" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CollegeSettings" ADD COLUMN     "approvalRequired" "ApprovalAction"[],
ADD COLUMN     "enforceTierUpgrade" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxOffersPerStudent" INTEGER DEFAULT 1;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "placedTier" "CompanyTier";

-- CreateTable
CREATE TABLE "RoundResult" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "status" "RoundResultStatus" NOT NULL,
    "score" DECIMAL(7,2),
    "remarks" TEXT,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "packageLpa" DECIMAL(6,2) NOT NULL,
    "isPpo" BOOLEAN NOT NULL DEFAULT false,
    "status" "OfferStatus" NOT NULL DEFAULT 'OFFERED',
    "expiresAt" TIMESTAMP(3),
    "letterPath" TEXT,
    "letterName" TEXT,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "joiningStatus" "JoiningStatus" NOT NULL DEFAULT 'PENDING',
    "joiningDate" DATE,
    "createdById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "requestedById" UUID NOT NULL,
    "decidedById" UUID,
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "executionError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "studentId" UUID,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "sentById" UUID NOT NULL,
    "approvalRequestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoundResult_roundId_status_idx" ON "RoundResult"("roundId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoundResult_applicationId_roundId_key" ON "RoundResult"("applicationId", "roundId");

-- CreateIndex
CREATE INDEX "Offer_collegeId_status_idx" ON "Offer"("collegeId", "status");

-- CreateIndex
CREATE INDEX "Offer_studentId_status_idx" ON "Offer"("studentId", "status");

-- CreateIndex
CREATE INDEX "Offer_driveId_idx" ON "Offer"("driveId");

-- CreateIndex
CREATE INDEX "Offer_companyId_status_idx" ON "Offer"("companyId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_collegeId_status_createdAt_idx" ON "ApprovalRequest"("collegeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_collegeId_createdAt_idx" ON "MessageLog"("collegeId", "createdAt");

-- AddForeignKey
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DriveRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
