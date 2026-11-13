-- Control Centre: the platform-wide module emergency switch (an absent row means on) and security event reviews. Additive only.
-- Rollback (manual, safe): DROP TABLE "PlatformSecurityReview"; DROP TABLE "PlatformModuleSetting"; DROP TYPE "SecurityReviewStatus"; and delete this migration's row from "_prisma_migrations".

-- CreateEnum
CREATE TYPE "SecurityReviewStatus" AS ENUM ('UNDER_REVIEW', 'RESOLVED', 'NO_ACTION');

-- CreateTable
CREATE TABLE "PlatformModuleSetting" (
    "module" "ModuleKey" NOT NULL,
    "globallyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

CONSTRAINT "PlatformModuleSetting_pkey" PRIMARY KEY ("module")
);

-- CreateTable
CREATE TABLE "PlatformSecurityReview" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "SecurityReviewStatus" NOT NULL,
    "note" TEXT,
    "reviewedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "PlatformSecurityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformSecurityReview_status_updatedAt_idx" ON "PlatformSecurityReview"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSecurityReview_source_eventId_key" ON "PlatformSecurityReview"("source", "eventId");

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "PlatformModuleSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformSecurityReview" ENABLE ROW LEVEL SECURITY;
