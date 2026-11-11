-- Gate 4 Phase 4.4.3 platform-wide AI kill switch. Additive only: one new table, no foreign keys, nothing altered or backfilled.
-- Named after 20261117090000_ai_configuration so it applies after it (migrations apply in name order).
-- Rollback (manual, safe, nothing references it): DROP TABLE "AiGlobalSetting"; and delete this migration's row from "_prisma_migrations". See docs/AI_CONFIG.md.

-- CreateTable
CREATE TABLE "AiGlobalSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "AiGlobalSetting_pkey" PRIMARY KEY ("id"),
    -- One row only: the platform has one global switch. (Prisma does not model CHECK constraints; it does not report this as drift.)
    CONSTRAINT "AiGlobalSetting_single_row" CHECK ("id" = 'global')
);

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "AiGlobalSetting" ENABLE ROW LEVEL SECURITY;
