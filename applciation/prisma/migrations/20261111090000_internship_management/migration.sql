-- CreateEnum
CREATE TYPE "InternshipMode" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InternshipApplicationStatus" AS ENUM ('APPLIED', 'COLLEGE_APPROVED', 'COLLEGE_REJECTED', 'COMPANY_SELECTED', 'COMPANY_REJECTED', 'WITHDRAWN', 'ALLOTTED');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');

-- CreateEnum
CREATE TYPE "InternshipTaskStatus" AS ENUM ('ASSIGNED', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PpoStatus" AS ENUM ('NONE', 'EXPECTED', 'OFFERED', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "Internship" ADD COLUMN     "applicationId" UUID,
ADD COLUMN     "certificateMime" TEXT,
ADD COLUMN     "certificateName" TEXT,
ADD COLUMN     "certificateNote" TEXT,
ADD COLUMN     "certificatePath" TEXT,
ADD COLUMN     "certificateStatus" "CertificateStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "certificateUploadedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completionOverride" TEXT,
ADD COLUMN     "facultyMentorId" UUID,
ADD COLUMN     "hoursPerDay" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "postingId" UUID,
ADD COLUMN     "ppoNote" TEXT,
ADD COLUMN     "ppoOfferId" UUID,
ADD COLUMN     "ppoStatus" "PpoStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "scheduleNote" TEXT,
ADD COLUMN     "stipendInr" INTEGER,
ADD COLUMN     "workDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- CreateTable
CREATE TABLE "InternshipPosting" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "companyId" UUID,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "mode" "InternshipMode" NOT NULL DEFAULT 'ONSITE',
    "stipendInr" INTEGER,
    "openings" INTEGER,
    "skills" TEXT[],
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "applicationDeadline" TIMESTAMP(3) NOT NULL,
    "companyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "companyConfirmedNote" TEXT,
    "minCgpa" DECIMAL(4,2),
    "minTenthPct" DECIMAL(5,2),
    "minTwelfthPct" DECIMAL(5,2),
    "maxActiveBacklogs" INTEGER,
    "departmentIds" UUID[],
    "batchIds" UUID[],
    "programIds" UUID[],
    "allowPlaced" BOOLEAN NOT NULL DEFAULT true,
    "status" "PostingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipApplication" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "postingId" UUID,
    "selfSourced" BOOLEAN NOT NULL DEFAULT false,
    "companyName" TEXT,
    "role" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "mentorName" TEXT,
    "mentorEmail" TEXT,
    "offerLetterPath" TEXT,
    "offerLetterName" TEXT,
    "note" TEXT,
    "status" "InternshipApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "eligibilityGaps" TEXT[],
    "collegeDecidedById" UUID,
    "collegeDecidedAt" TIMESTAMP(3),
    "collegeNote" TEXT,
    "companyDecidedAt" TIMESTAMP(3),
    "companyNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipAttendance" (
    "id" UUID NOT NULL,
    "internshipId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceMark" NOT NULL,
    "note" TEXT,
    "markedBy" TEXT NOT NULL DEFAULT 'STUDENT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipTask" (
    "id" UUID NOT NULL,
    "internshipId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "isFinalReport" BOOLEAN NOT NULL DEFAULT false,
    "status" "InternshipTaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedByName" TEXT NOT NULL,
    "assignedByUserId" UUID,
    "submissionText" TEXT,
    "submissionUrl" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileMime" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipFeedback" (
    "id" UUID NOT NULL,
    "internshipId" UUID NOT NULL,
    "authorType" "ReviewerType" NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" UUID,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipMentorLink" (
    "id" UUID NOT NULL,
    "internshipId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipMentorLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternshipPosting_collegeId_status_idx" ON "InternshipPosting"("collegeId", "status");

-- CreateIndex
CREATE INDEX "InternshipApplication_collegeId_status_idx" ON "InternshipApplication"("collegeId", "status");

-- CreateIndex
CREATE INDEX "InternshipApplication_studentId_idx" ON "InternshipApplication"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "InternshipApplication_postingId_studentId_key" ON "InternshipApplication"("postingId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "InternshipAttendance_internshipId_date_key" ON "InternshipAttendance"("internshipId", "date");

-- CreateIndex
CREATE INDEX "InternshipTask_internshipId_idx" ON "InternshipTask"("internshipId");

-- CreateIndex
CREATE INDEX "InternshipFeedback_internshipId_createdAt_idx" ON "InternshipFeedback"("internshipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InternshipMentorLink_tokenHash_key" ON "InternshipMentorLink"("tokenHash");

-- CreateIndex
CREATE INDEX "InternshipMentorLink_internshipId_idx" ON "InternshipMentorLink"("internshipId");

-- CreateIndex
CREATE UNIQUE INDEX "Internship_applicationId_key" ON "Internship"("applicationId");

-- AddForeignKey
ALTER TABLE "InternshipApplication" ADD CONSTRAINT "InternshipApplication_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "InternshipPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipApplication" ADD CONSTRAINT "InternshipApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipAttendance" ADD CONSTRAINT "InternshipAttendance_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "Internship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipTask" ADD CONSTRAINT "InternshipTask_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "Internship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipFeedback" ADD CONSTRAINT "InternshipFeedback_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "Internship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipMentorLink" ADD CONSTRAINT "InternshipMentorLink_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "Internship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

