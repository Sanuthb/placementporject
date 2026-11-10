-- CreateTable
CREATE TABLE "JdShortlist" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "jdId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "mandatoryStatus" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "decidedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JdShortlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JdShortlist_studentId_idx" ON "JdShortlist"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "JdShortlist_jdId_studentId_key" ON "JdShortlist"("jdId", "studentId");

-- AddForeignKey
ALTER TABLE "JdShortlist" ADD CONSTRAINT "JdShortlist_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "JobDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JdShortlist" ADD CONSTRAINT "JdShortlist_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

