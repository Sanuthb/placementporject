-- Control Centre: platform announcements, their target institutions and read acknowledgements. Additive only. Institution links are plain ids with no foreign key.
-- Rollback (manual, safe): DROP TABLE "PlatformAnnouncementAck"; DROP TABLE "PlatformAnnouncementTarget"; DROP TABLE "PlatformAnnouncement"; DROP TYPE "AnnouncementKind"; and delete this migration's row from "_prisma_migrations".

-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('MAINTENANCE', 'FEATURE', 'OUTAGE');

-- CreateTable
CREATE TABLE "PlatformAnnouncement" (
    "id" UUID NOT NULL,
    "kind" "AnnouncementKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "allInstitutions" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAnnouncementTarget" (
    "announcementId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,

CONSTRAINT "PlatformAnnouncementTarget_pkey" PRIMARY KEY ("announcementId","collegeId")
);

-- CreateTable
CREATE TABLE "PlatformAnnouncementAck" (
    "announcementId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "PlatformAnnouncementAck_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_publishedAt_startsAt_idx" ON "PlatformAnnouncement"("publishedAt", "startsAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementTarget_collegeId_idx" ON "PlatformAnnouncementTarget"("collegeId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementAck_collegeId_idx" ON "PlatformAnnouncementAck"("collegeId");

-- AddForeignKey
ALTER TABLE "PlatformAnnouncementTarget" ADD CONSTRAINT "PlatformAnnouncementTarget_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "PlatformAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAnnouncementAck" ADD CONSTRAINT "PlatformAnnouncementAck_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "PlatformAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, matching prisma/harden.sql: the public API key reaches nothing; the app server's privileged role bypasses it.
ALTER TABLE "PlatformAnnouncement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAnnouncementTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAnnouncementAck" ENABLE ROW LEVEL SECURITY;
