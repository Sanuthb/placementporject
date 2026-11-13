-- Control Centre: scheduled launch and gradual rollout for the platform-wide module switch. Additive only: two new columns on one table.
-- Existing rows keep today's behaviour: no schedule (availableFrom is empty) and a 100 percent rollout.
-- Rollback (manual, safe): ALTER TABLE "PlatformModuleSetting" DROP COLUMN "rolloutPercent", DROP COLUMN "availableFrom"; and delete this migration's row from "_prisma_migrations".

-- AlterTable
ALTER TABLE "PlatformModuleSetting" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "rolloutPercent" INTEGER NOT NULL DEFAULT 100;

-- The share is a percentage.
ALTER TABLE "PlatformModuleSetting" ADD CONSTRAINT "PlatformModuleSetting_rolloutPercent_bounds" CHECK ("rolloutPercent" BETWEEN 0 AND 100);
