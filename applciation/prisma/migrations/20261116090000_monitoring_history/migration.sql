-- Gate 4 Phase 4.3 monitoring history. Additive only: two new tables, no foreign keys, nothing altered or backfilled.
-- Rollback (manual, safe): DROP TABLE "MonitorEvent"; DROP TABLE "JobRun";  (see docs/MONITORING.md)

-- CreateTable
CREATE TABLE "JobRun" (
    "id" UUID NOT NULL,
    "job" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'scheduler',
    "slotAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "durationMs" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorEvent" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "status" INTEGER,
    "code" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "requestId" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "MonitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_slotAt_idx" ON "JobRun"("slotAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_job_slotAt_key" ON "JobRun"("job", "slotAt");

-- CreateIndex
CREATE INDEX "MonitorEvent_at_idx" ON "MonitorEvent"("at");

-- CreateIndex
CREATE INDEX "MonitorEvent_service_at_idx" ON "MonitorEvent"("service", "at");

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "JobRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonitorEvent" ENABLE ROW LEVEL SECURITY;
