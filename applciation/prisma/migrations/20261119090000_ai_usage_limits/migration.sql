-- Gate 4 Phase 4.4.5 AI usage tracking and limits. Additive only: one enum, two new tables, one new column with a default (existing rows get 0) and one new index. Nothing is dropped or rewritten.
-- Named after 20261118090000_ai_global_switch so it applies after it (migrations apply in name order).
-- Rollback (manual, safe): DROP TABLE "AiQuotaCounter"; DROP TABLE "AiLimit"; DROP TYPE "AiLimitKind"; DROP INDEX "AiUsageDaily_day_idx"; ALTER TABLE "AiUsageDaily" DROP COLUMN "blocked";
--   and delete this migration's row from "_prisma_migrations". See docs/AI_CONFIG.md.

-- CreateEnum
CREATE TYPE "AiLimitKind" AS ENUM ('COLLEGE_DEFAULT', 'COLLEGE', 'PROVIDER', 'PURPOSE');

-- AlterTable
ALTER TABLE "AiUsageDaily" ADD COLUMN     "blocked" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AiLimit" (
    "id" UUID NOT NULL,
    "kind" "AiLimitKind" NOT NULL,
    "key" TEXT NOT NULL,
    "dailyCalls" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "AiLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQuotaCounter" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQuotaCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiLimit_kind_key_key" ON "AiLimit"("kind", "key");

-- CreateIndex
CREATE INDEX "AiQuotaCounter_day_idx" ON "AiQuotaCounter"("day");

-- CreateIndex
CREATE UNIQUE INDEX "AiQuotaCounter_day_scope_key" ON "AiQuotaCounter"("day", "scope");

-- CreateIndex
CREATE INDEX "AiUsageDaily_day_idx" ON "AiUsageDaily"("day");

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "AiLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiQuotaCounter" ENABLE ROW LEVEL SECURITY;
