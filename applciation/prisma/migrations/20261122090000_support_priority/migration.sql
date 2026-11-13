-- Control Centre: support request priority. Additive only: one new enum and one new column with a default (existing rows become NORMAL).
-- Rollback (manual, safe): ALTER TABLE "PlatformSupportRequest" DROP COLUMN "priority"; DROP TYPE "SupportPriority"; and delete this migration's row from "_prisma_migrations".

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "PlatformSupportRequest" ADD COLUMN     "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL';
