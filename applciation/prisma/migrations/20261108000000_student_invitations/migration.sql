
-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('INVITATION_PENDING', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'PROFILE_IN_PROGRESS', 'SUBMITTED', 'VERIFICATION_IN_PROGRESS', 'CHANGES_REQUESTED', 'VERIFIED', 'REJECTED', 'INVITATION_EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "CollegeSettings" ADD COLUMN     "dataDeclaration" TEXT,
ADD COLUMN     "inviteExpiryDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "admissionYear" INTEGER,
ADD COLUMN     "campusId" UUID,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'INVITATION_PENDING';

-- CreateTable
CREATE TABLE "Campus" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInvitation" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "campusId" UUID,
    "departmentId" UUID NOT NULL,
    "programId" UUID,
    "branchId" UUID,
    "batchId" UUID NOT NULL,
    "admissionYear" INTEGER,
    "graduationYear" INTEGER,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "lastResentAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentOnboardingProfile" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "personal" JSONB NOT NULL DEFAULT '{}',
    "academics" JSONB NOT NULL DEFAULT '{}',
    "career" JSONB NOT NULL DEFAULT '{}',
    "declarationAcceptedAt" TIMESTAMP(3),
    "declarationText" TEXT,
    "submittedAt" TIMESTAMP(3),
    "proposedName" TEXT,
    "nameDecidedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentOnboardingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCorrectionRequest" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationEmailLog" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "InvitationEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campus_collegeId_name_key" ON "Campus"("collegeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvitation_studentId_key" ON "StudentInvitation"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvitation_tokenHash_key" ON "StudentInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StudentInvitation_collegeId_status_idx" ON "StudentInvitation"("collegeId", "status");

-- CreateIndex
CREATE INDEX "StudentInvitation_status_expiresAt_idx" ON "StudentInvitation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentOnboardingProfile_studentId_key" ON "StudentOnboardingProfile"("studentId");

-- CreateIndex
CREATE INDEX "StudentOnboardingProfile_collegeId_idx" ON "StudentOnboardingProfile"("collegeId");

-- CreateIndex
CREATE INDEX "StudentCorrectionRequest_collegeId_status_idx" ON "StudentCorrectionRequest"("collegeId", "status");

-- CreateIndex
CREATE INDEX "StudentCorrectionRequest_studentId_idx" ON "StudentCorrectionRequest"("studentId");

-- CreateIndex
CREATE INDEX "InvitationEmailLog_invitationId_createdAt_idx" ON "InvitationEmailLog"("invitationId", "createdAt");

-- CreateIndex
CREATE INDEX "InvitationEmailLog_collegeId_status_idx" ON "InvitationEmailLog"("collegeId", "status");

-- CreateIndex
CREATE INDEX "Student_collegeId_onboardingStatus_idx" ON "Student"("collegeId", "onboardingStatus");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitation" ADD CONSTRAINT "StudentInvitation_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitation" ADD CONSTRAINT "StudentInvitation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitation" ADD CONSTRAINT "StudentInvitation_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentOnboardingProfile" ADD CONSTRAINT "StudentOnboardingProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCorrectionRequest" ADD CONSTRAINT "StudentCorrectionRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationEmailLog" ADD CONSTRAINT "InvitationEmailLog_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "StudentInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationEmailLog" ADD CONSTRAINT "InvitationEmailLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing students keep a sensible onboarding status.
UPDATE "Student" SET "onboardingStatus" = CASE
  WHEN "stage" IN ('VERIFIED', 'ONBOARDED') THEN 'VERIFIED'::"OnboardingStatus"
  WHEN "inviteStatus" = 'ACTIVATED' THEN 'PROFILE_IN_PROGRESS'::"OnboardingStatus"
  WHEN "inviteStatus" = 'SENT' THEN 'INVITATION_SENT'::"OnboardingStatus"
  ELSE 'INVITATION_PENDING'::"OnboardingStatus" END;
UPDATE "Student" s SET "admissionYear" = COALESCE(b."admissionYear", b."startYear") FROM "Batch" b WHERE b."id" = s."batchId" AND s."admissionYear" IS NULL;

-- Keep the public API locked down for the new tables (same as prisma/harden.sql).
ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentOnboardingProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentCorrectionRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvitationEmailLog" ENABLE ROW LEVEL SECURITY;
