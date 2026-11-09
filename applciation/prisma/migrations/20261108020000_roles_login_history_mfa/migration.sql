-- AlterTable
ALTER TABLE "CollegeSettings" ADD COLUMN     "requireMfaForAdmins" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraRoles" "Role"[] DEFAULT ARRAY[]::"Role"[];

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" UUID NOT NULL,
    "collegeId" UUID,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "method" TEXT,
    "mfa" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginEvent_sessionId_key" ON "LoginEvent"("sessionId");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_collegeId_createdAt_idx" ON "LoginEvent"("collegeId", "createdAt");

ALTER TABLE "LoginEvent" ENABLE ROW LEVEL SECURITY;
