-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO', 'VIDEO_LINK', 'WEBSITE', 'QUESTION_BANK', 'SAMPLE_TEST', 'CODING_PRACTICE', 'COMPANY_MATERIAL');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResourceVisibility" AS ENUM ('ALL_STUDENTS', 'ASSIGNED_ONLY', 'STAFF_ONLY');

-- CreateEnum
CREATE TYPE "ResourceDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ResourceTarget" AS ENUM ('STUDENT', 'DEPARTMENT', 'BATCH', 'GROUP', 'SKILL_GAP', 'MOCK_TEST');

-- DropIndex
DROP INDEX "PrepResource_collegeId_isActive_idx";

-- AlterTable
ALTER TABLE "PrepResource" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "difficulty" "ResourceDifficulty",
ADD COLUMN     "durationMin" INTEGER,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "jobRoles" TEXT[],
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'English',
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "skills" TEXT[],
ADD COLUMN     "status" "ResourceStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "type" "ResourceType" NOT NULL DEFAULT 'WEBSITE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "visibility" "ResourceVisibility" NOT NULL DEFAULT 'ASSIGNED_ONLY',
ALTER COLUMN "url" DROP NOT NULL;

-- Resources that existed before the approval workflow were visible to every student: keep them live (or archived if they were switched off).
UPDATE "PrepResource" SET "status" = CASE WHEN "isActive" THEN 'APPROVED'::"ResourceStatus" ELSE 'ARCHIVED'::"ResourceStatus" END, "visibility" = 'ALL_STUDENTS';

-- AlterTable
ALTER TABLE "PrepResource" DROP COLUMN "isActive";

-- CreateTable
CREATE TABLE "ResourceVersion" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "url" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "targetType" "ResourceTarget" NOT NULL,
    "targetId" UUID,
    "targetKey" TEXT,
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "assignedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceProgress" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedVersion" INTEGER,
    "rating" INTEGER,
    "feedback" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceVersion_resourceId_version_key" ON "ResourceVersion"("resourceId", "version");

-- CreateIndex
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_collegeId_targetType_targetId_idx" ON "ResourceAssignment"("collegeId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ResourceProgress_studentId_idx" ON "ResourceProgress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceProgress_resourceId_studentId_key" ON "ResourceProgress"("resourceId", "studentId");

-- CreateIndex
CREATE INDEX "PrepResource_collegeId_status_idx" ON "PrepResource"("collegeId", "status");

-- AddForeignKey
ALTER TABLE "ResourceVersion" ADD CONSTRAINT "ResourceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PrepResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PrepResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceProgress" ADD CONSTRAINT "ResourceProgress_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PrepResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceProgress" ADD CONSTRAINT "ResourceProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

