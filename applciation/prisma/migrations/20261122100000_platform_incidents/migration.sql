-- Control Centre: platform incidents and their timeline. Additive only: new enums and two new tables. Nothing existing is changed.
-- Rollback (manual, safe): DROP TABLE "PlatformIncidentUpdate"; DROP TABLE "PlatformIncident"; DROP TYPE "IncidentStatus"; DROP TYPE "IncidentSeverity"; and delete this migration's row from "_prisma_migrations".

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');

-- CreateTable
CREATE TABLE "PlatformIncident" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'INVESTIGATING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "PlatformIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformIncidentUpdate" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "adminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "PlatformIncidentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformIncident_status_startedAt_idx" ON "PlatformIncident"("status", "startedAt");

-- CreateIndex
CREATE INDEX "PlatformIncidentUpdate_incidentId_createdAt_idx" ON "PlatformIncidentUpdate"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformIncidentUpdate" ADD CONSTRAINT "PlatformIncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PlatformIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "PlatformIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformIncidentUpdate" ENABLE ROW LEVEL SECURITY;
