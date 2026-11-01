-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqItem" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FAQ',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateIndex
CREATE INDEX "FaqItem_collegeId_isPublished_sortOrder_idx" ON "FaqItem"("collegeId", "isPublished", "sortOrder");

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lock-down as every other table: reachable only through the app server.
ALTER TABLE "TicketAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FaqItem" ENABLE ROW LEVEL SECURITY;
