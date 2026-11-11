-- Gate 4 Phase 4.4.2 AI configuration foundation. Additive only: two enums and two new tables, no foreign keys, nothing altered or backfilled.
-- Rollback (manual, safe, nothing references these objects): DROP TABLE "AiUsageDaily"; DROP TABLE "AiProviderConfig"; DROP TYPE "AiPurpose"; DROP TYPE "AiProvider";
--   and delete this migration's row from "_prisma_migrations". See docs/AI_CONFIG.md.

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GROQ', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "AiPurpose" AS ENUM ('TEXT', 'VISION', 'INTERVIEW');

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" UUID NOT NULL,
    "purpose" "AiPurpose" NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "keyCiphertext" TEXT,
    "keyVersion" INTEGER,
    "keyLast4" TEXT,
    "keyUpdatedAt" TIMESTAMP(3),
    "keyUpdatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageDaily" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "collegeKey" TEXT NOT NULL,
    "purpose" "AiPurpose" NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "timeouts" INTEGER NOT NULL DEFAULT 0,
    "rateLimited" INTEGER NOT NULL DEFAULT 0,
    "totalMs" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_purpose_key" ON "AiProviderConfig"("purpose");

-- CreateIndex
CREATE INDEX "AiProviderConfig_keyVersion_idx" ON "AiProviderConfig"("keyVersion");

-- CreateIndex
CREATE INDEX "AiUsageDaily_collegeKey_day_idx" ON "AiUsageDaily"("collegeKey", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageDaily_day_collegeKey_purpose_provider_model_feature_key" ON "AiUsageDaily"("day", "collegeKey", "purpose", "provider", "model", "feature");

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing (the key ciphertext must never be readable through it); the app server's privileged role bypasses it.
ALTER TABLE "AiProviderConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiUsageDaily" ENABLE ROW LEVEL SECURITY;
