-- CreateTable
CREATE TABLE "SavedDrive" (
    "studentId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedDrive_pkey" PRIMARY KEY ("studentId","driveId")
);

-- AddForeignKey
ALTER TABLE "SavedDrive" ADD CONSTRAINT "SavedDrive_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedDrive" ADD CONSTRAINT "SavedDrive_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lock-down as every other table: reachable only through the app server.
ALTER TABLE "SavedDrive" ENABLE ROW LEVEL SECURITY;
