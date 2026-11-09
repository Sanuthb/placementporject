-- AlterTable
ALTER TABLE "StudentDocument" ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "replacesId" UUID,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" UUID,
ADD COLUMN     "archiveReason" TEXT;

-- CreateIndex
CREATE INDEX "StudentDocument_studentId_sha256_idx" ON "StudentDocument"("studentId", "sha256");
