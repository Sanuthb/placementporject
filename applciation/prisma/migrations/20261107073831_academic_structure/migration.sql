-- CreateEnum
CREATE TYPE "ProgrammeLevel" AS ENUM ('DIPLOMA', 'UG', 'PG', 'DOCTORAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EducationStatus" AS ENUM ('PURSUING', 'COMPLETED', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "DocCategory" AS ENUM ('TENTH_MARKS', 'TWELFTH_MARKS', 'DIPLOMA_CERTIFICATE', 'DEGREE_MARKS', 'DEGREE_CERTIFICATE', 'PROVISIONAL_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocVerification" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProgressionKind" AS ENUM ('ENROLLED', 'PROMOTED', 'REPEATED', 'ARREAR', 'TRANSFERRED', 'DISCONTINUED');

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "status" "SessionStatus" NOT NULL DEFAULT 'UPCOMING';

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "admissionYear" INTEGER,
ADD COLUMN     "branchId" UUID,
ADD COLUMN     "coordinatorId" UUID,
ADD COLUMN     "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "durationYears" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "level" "ProgrammeLevel" NOT NULL DEFAULT 'PG',
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "semesterCount" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "university" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "address" TEXT,
ADD COLUMN     "branchId" UUID,
ADD COLUMN     "currentAcademicYearId" UUID,
ADD COLUMN     "currentSemesterId" UUID,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "gender" TEXT;

-- CreateTable
CREATE TABLE "ProgrammeBranch" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgrammeBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "academicYearId" UUID,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "status" "SessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEducationRecord" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "specialisation" TEXT,
    "institution" TEXT NOT NULL,
    "boardOrUniversity" TEXT,
    "rollNo" TEXT,
    "admissionYear" INTEGER,
    "completionYear" INTEGER,
    "percentage" DECIMAL(5,2),
    "cgpa" DECIMAL(4,2),
    "maxMarks" INTEGER,
    "obtainedMarks" INTEGER,
    "backlogs" INTEGER NOT NULL DEFAULT 0,
    "status" "EducationStatus" NOT NULL DEFAULT 'COMPLETED',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEducationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "category" "DocCategory" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "DocVerification" NOT NULL DEFAULT 'PENDING',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProgression" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "semesterId" UUID,
    "academicYearId" UUID,
    "kind" "ProgressionKind" NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProgression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgrammeBranch_collegeId_idx" ON "ProgrammeBranch"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeBranch_programId_name_key" ON "ProgrammeBranch"("programId", "name");

-- CreateIndex
CREATE INDEX "Semester_collegeId_idx" ON "Semester"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_batchId_number_key" ON "Semester"("batchId", "number");

-- CreateIndex
CREATE INDEX "StudentEducationRecord_collegeId_studentId_idx" ON "StudentEducationRecord"("collegeId", "studentId");

-- CreateIndex
CREATE INDEX "StudentDocument_collegeId_studentId_idx" ON "StudentDocument"("collegeId", "studentId");

-- CreateIndex
CREATE INDEX "StudentDocument_collegeId_status_idx" ON "StudentDocument"("collegeId", "status");

-- CreateIndex
CREATE INDEX "StudentProgression_collegeId_studentId_createdAt_idx" ON "StudentProgression"("collegeId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Batch_collegeId_programId_idx" ON "Batch"("collegeId", "programId");

-- CreateIndex
CREATE INDEX "Program_collegeId_departmentId_idx" ON "Program"("collegeId", "departmentId");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeBranch" ADD CONSTRAINT "ProgrammeBranch_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProgrammeBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProgrammeBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_currentSemesterId_fkey" FOREIGN KEY ("currentSemesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_currentAcademicYearId_fkey" FOREIGN KEY ("currentAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEducationRecord" ADD CONSTRAINT "StudentEducationRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgression" ADD CONSTRAINT "StudentProgression_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgression" ADD CONSTRAINT "StudentProgression_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;
