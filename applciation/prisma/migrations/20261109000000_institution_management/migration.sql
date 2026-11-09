-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FACULTY';
-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "universityId" UUID;
-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "platformActorId" UUID;
-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "mentorId" UUID;
-- CreateTable
CREATE TABLE "University" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "FacultyProfile" (
    "userId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "employeeId" TEXT,
    "designation" TEXT,
    "qualification" TEXT,
    "specialisation" TEXT,
    "phone" TEXT,
    "joinedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacultyProfile_pkey" PRIMARY KEY ("userId")
);
-- CreateTable
CREATE TABLE "FacultyDepartment" (
    "userId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    CONSTRAINT "FacultyDepartment_pkey" PRIMARY KEY ("userId","departmentId")
);
-- CreateTable
CREATE TABLE "FacultyProgram" (
    "userId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    CONSTRAINT "FacultyProgram_pkey" PRIMARY KEY ("userId","programId")
);
-- CreateTable
CREATE TABLE "FacultyBatch" (
    "userId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    CONSTRAINT "FacultyBatch_pkey" PRIMARY KEY ("userId","batchId")
);
-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "University_collegeId_idx" ON "University"("collegeId");
-- CreateIndex
CREATE UNIQUE INDEX "University_collegeId_code_key" ON "University"("collegeId", "code");
-- CreateIndex
CREATE INDEX "FacultyProfile_collegeId_idx" ON "FacultyProfile"("collegeId");
-- CreateIndex
CREATE UNIQUE INDEX "FacultyProfile_collegeId_employeeId_key" ON "FacultyProfile"("collegeId", "employeeId");
-- CreateIndex
CREATE INDEX "FacultyDepartment_collegeId_departmentId_idx" ON "FacultyDepartment"("collegeId", "departmentId");
-- CreateIndex
CREATE INDEX "FacultyProgram_collegeId_programId_idx" ON "FacultyProgram"("collegeId", "programId");
-- CreateIndex
CREATE INDEX "FacultyBatch_collegeId_batchId_idx" ON "FacultyBatch"("collegeId", "batchId");
-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
-- CreateIndex
CREATE INDEX "Program_universityId_idx" ON "Program"("universityId");
-- CreateIndex
CREATE INDEX "Student_collegeId_mentorId_idx" ON "Student"("collegeId", "mentorId");
-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "University" ADD CONSTRAINT "University_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyProfile" ADD CONSTRAINT "FacultyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyProfile" ADD CONSTRAINT "FacultyProfile_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyDepartment" ADD CONSTRAINT "FacultyDepartment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyDepartment" ADD CONSTRAINT "FacultyDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyProgram" ADD CONSTRAINT "FacultyProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyProgram" ADD CONSTRAINT "FacultyProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyBatch" ADD CONSTRAINT "FacultyBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FacultyBatch" ADD CONSTRAINT "FacultyBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Names are unique within a college ignoring case ("Anna University" and "anna university" are one record).
CREATE UNIQUE INDEX "University_collegeId_lower_name_key" ON "University"("collegeId", lower(btrim("name")));

-- Data migration, additive only. Every distinct university name already typed into a programme becomes a University record
-- (one per college, case/whitespace variants merged) and the programme is linked to it. The original Program.university text
-- is left untouched, so nothing is lost and the old screens keep working.
INSERT INTO "University" ("id", "collegeId", "name", "code", "updatedAt")
SELECT gen_random_uuid(), g."collegeId", g."name",
       COALESCE(NULLIF(upper(left(regexp_replace(g."name", '[^A-Za-z0-9]', '', 'g'), 8)), ''), 'UNI') || '-' || g."rn",
       CURRENT_TIMESTAMP
FROM (
  SELECT "collegeId", min(btrim("university")) AS "name",
         row_number() OVER (PARTITION BY "collegeId" ORDER BY lower(btrim("university"))) AS "rn"
  FROM "Program"
  WHERE "university" IS NOT NULL AND btrim("university") <> ''
  GROUP BY "collegeId", lower(btrim("university"))
) g;

UPDATE "Program" p
SET "universityId" = u."id"
FROM "University" u
WHERE u."collegeId" = p."collegeId" AND lower(btrim(u."name")) = lower(btrim(p."university")) AND p."universityId" IS NULL;
