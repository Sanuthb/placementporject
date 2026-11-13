-- Gate 4 SA-TC-067 platform policy (minimum administrator MFA, operational retention). Additive only: one new table, nothing existing is changed.
-- No row is created here: an absent row means "no platform minimum, built-in retention defaults", which is today's behaviour.
-- Rollback (manual, safe): DROP TABLE "PlatformPolicy"; and delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "PlatformPolicy" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "requireAdminMfa" BOOLEAN NOT NULL DEFAULT false,
    "retentionJobRunDays" INTEGER,
    "retentionMonitorEventDays" INTEGER,
    "retentionAiUsageDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "PlatformPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlatformPolicy_single_row" CHECK ("id" = 'platform'),
    CONSTRAINT "PlatformPolicy_bounds" CHECK (
        ("retentionJobRunDays" IS NULL OR "retentionJobRunDays" BETWEEN 30 AND 365) AND
        ("retentionMonitorEventDays" IS NULL OR "retentionMonitorEventDays" BETWEEN 7 AND 90) AND
        ("retentionAiUsageDays" IS NULL OR "retentionAiUsageDays" BETWEEN 30 AND 365))
);

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "PlatformPolicy" ENABLE ROW LEVEL SECURITY;
