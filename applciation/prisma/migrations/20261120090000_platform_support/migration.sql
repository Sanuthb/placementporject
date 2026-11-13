-- Gate 4 Platform support requests (SA-TC-011, 063, 064, 065). Additive only: two new tables, no change to existing tables. Reuses the TicketStatus enum.
-- Rollback (manual, safe): DROP TABLE "PlatformSupportEntry"; DROP TABLE "PlatformSupportRequest"; and delete this migration's row from "_prisma_migrations".

-- CreateTable
CREATE TABLE "PlatformSupportRequest" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "requesterId" UUID,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformSupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSupportEntry" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "authorAdminId" UUID,
    "authorUserId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSupportEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformSupportRequest_collegeId_status_createdAt_idx" ON "PlatformSupportRequest"("collegeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSupportRequest_status_createdAt_idx" ON "PlatformSupportRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSupportEntry_requestId_createdAt_idx" ON "PlatformSupportEntry"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformSupportRequest" ADD CONSTRAINT "PlatformSupportRequest_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportEntry" ADD CONSTRAINT "PlatformSupportEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlatformSupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "PlatformSupportRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformSupportEntry" ENABLE ROW LEVEL SECURITY;
