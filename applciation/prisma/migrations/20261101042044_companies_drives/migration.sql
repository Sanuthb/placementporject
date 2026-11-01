-- CreateEnum
CREATE TYPE "CompanyTier" AS ENUM ('DREAM', 'SUPER_DREAM', 'CORE', 'REGULAR');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('ACTIVE', 'DORMANT', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('CONVERSATION', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'INTERNSHIP', 'INTERNSHIP_WITH_OFFER');

-- CreateEnum
CREATE TYPE "DriveStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('APTITUDE', 'CODING', 'GROUP_DISCUSSION', 'TECHNICAL', 'HR', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'ON_HOLD', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "isPlaced" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "tier" "CompanyTier" NOT NULL DEFAULT 'REGULAR',
    "relationshipStatus" "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyNote" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" "NoteKind" NOT NULL DEFAULT 'CONVERSATION',
    "body" TEXT NOT NULL,
    "followUpDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drive" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "location" TEXT,
    "packageMinLpa" DECIMAL(6,2),
    "packageMaxLpa" DECIMAL(6,2),
    "venue" TEXT,
    "description" TEXT,
    "applicationDeadline" TIMESTAMP(3) NOT NULL,
    "driveDate" TIMESTAMP(3) NOT NULL,
    "status" "DriveStatus" NOT NULL DEFAULT 'DRAFT',
    "minCgpa" DECIMAL(4,2),
    "minTenthPct" DECIMAL(5,2),
    "minTwelfthPct" DECIMAL(5,2),
    "maxActiveBacklogs" INTEGER,
    "departmentIds" UUID[],
    "batchIds" UUID[],
    "programIds" UUID[],
    "allowPlaced" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveRound" (
    "id" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "RoundType" NOT NULL,
    "name" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "venue" TEXT,

    CONSTRAINT "DriveRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveDocument" (
    "id" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveException" (
    "id" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFeedback" (
    "driveId" UUID NOT NULL,
    "onStudents" TEXT,
    "onProcess" TEXT,
    "improvements" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFeedback_pkey" PRIMARY KEY ("driveId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_collegeId_name_key" ON "Company"("collegeId", "name");

-- CreateIndex
CREATE INDEX "CompanyNote_companyId_createdAt_idx" ON "CompanyNote"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Drive_collegeId_status_driveDate_idx" ON "Drive"("collegeId", "status", "driveDate");

-- CreateIndex
CREATE INDEX "Drive_companyId_idx" ON "Drive"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveRound_driveId_order_key" ON "DriveRound"("driveId", "order");

-- CreateIndex
CREATE INDEX "DriveDocument_driveId_idx" ON "DriveDocument"("driveId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveException_driveId_studentId_key" ON "DriveException"("driveId", "studentId");

-- CreateIndex
CREATE INDEX "Application_collegeId_studentId_idx" ON "Application"("collegeId", "studentId");

-- CreateIndex
CREATE INDEX "Application_driveId_status_idx" ON "Application"("driveId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_driveId_studentId_key" ON "Application"("driveId", "studentId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyNote" ADD CONSTRAINT "CompanyNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyNote" ADD CONSTRAINT "CompanyNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drive" ADD CONSTRAINT "Drive_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drive" ADD CONSTRAINT "Drive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveRound" ADD CONSTRAINT "DriveRound_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveDocument" ADD CONSTRAINT "DriveDocument_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveException" ADD CONSTRAINT "DriveException_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveException" ADD CONSTRAINT "DriveException_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFeedback" ADD CONSTRAINT "DriveFeedback_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
