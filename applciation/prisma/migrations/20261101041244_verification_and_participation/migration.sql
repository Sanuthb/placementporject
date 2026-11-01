-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "StudentStage" AS ENUM ('PROFILE_PENDING', 'VERIFIED', 'ONBOARDED');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('REGISTERED', 'OPTED_OUT', 'HIGHER_STUDIES', 'ENTREPRENEURSHIP', 'NOT_ELIGIBLE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationAction" AS ENUM ('SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "participationReason" TEXT,
ADD COLUMN     "participationStatus" "ParticipationStatus" NOT NULL DEFAULT 'REGISTERED',
ADD COLUMN     "stage" "StudentStage" NOT NULL DEFAULT 'PROFILE_PENDING';

-- CreateTable
CREATE TABLE "StudentSection" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "section" "ProfileSection" NOT NULL,
    "status" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL DEFAULT '{}',
    "pendingData" JSONB,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionDocument" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "section" "ProfileSection" NOT NULL,
    "action" "VerificationAction" NOT NULL,
    "actorId" UUID,
    "comment" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationHistory" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "fromStatus" "ParticipationStatus",
    "toStatus" "ParticipationStatus" NOT NULL,
    "reason" TEXT,
    "changedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationRequest" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "requestedStatus" "ParticipationStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentSection_collegeId_status_submittedAt_idx" ON "StudentSection"("collegeId", "status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSection_studentId_section_key" ON "StudentSection"("studentId", "section");

-- CreateIndex
CREATE INDEX "SectionDocument_sectionId_idx" ON "SectionDocument"("sectionId");

-- CreateIndex
CREATE INDEX "VerificationEvent_studentId_createdAt_idx" ON "VerificationEvent"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationEvent_collegeId_createdAt_idx" ON "VerificationEvent"("collegeId", "createdAt");

-- CreateIndex
CREATE INDEX "ParticipationHistory_studentId_createdAt_idx" ON "ParticipationHistory"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ParticipationRequest_collegeId_status_createdAt_idx" ON "ParticipationRequest"("collegeId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentSection" ADD CONSTRAINT "StudentSection_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSection" ADD CONSTRAINT "StudentSection_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionDocument" ADD CONSTRAINT "SectionDocument_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionDocument" ADD CONSTRAINT "SectionDocument_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "StudentSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationHistory" ADD CONSTRAINT "ParticipationHistory_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationHistory" ADD CONSTRAINT "ParticipationHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationHistory" ADD CONSTRAINT "ParticipationHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationRequest" ADD CONSTRAINT "ParticipationRequest_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationRequest" ADD CONSTRAINT "ParticipationRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
