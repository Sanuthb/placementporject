-- Control Centre: a record of refused requests (a signed-in person asked for something their role or institution's modules do not allow).
-- Additive only: one new table. It holds a route pattern, a role, an institution id and a time: no person and no request content.
-- Rollback (manual, safe): DROP TABLE "PlatformAccessDenial"; and delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "PlatformAccessDenial" (
    "id" UUID NOT NULL,
    "collegeId" UUID,
    "role" TEXT,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAccessDenial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAccessDenial_createdAt_idx" ON "PlatformAccessDenial"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAccessDenial_collegeId_createdAt_idx" ON "PlatformAccessDenial"("collegeId", "createdAt");

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "PlatformAccessDenial" ENABLE ROW LEVEL SECURITY;
