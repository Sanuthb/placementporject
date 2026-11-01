-- AlterTable
ALTER TABLE "Student" ADD COLUMN "psychConsentAt" TIMESTAMP(3),
ADD COLUMN "psychShareWithStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailAnnouncements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailReminders" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProfileView" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileView_studentId_createdAt_idx" ON "ProfileView"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ProfileView_actorId_studentId_createdAt_idx" ON "ProfileView"("actorId", "studentId", "createdAt");

-- Same lock-down as every other table: reachable only through the app server.
ALTER TABLE "ProfileView" ENABLE ROW LEVEL SECURITY;
