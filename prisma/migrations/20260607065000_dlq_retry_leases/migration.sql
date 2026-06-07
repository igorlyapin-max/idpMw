-- Add multi-worker retry leasing for DLQ items.
ALTER TABLE "DlqItem" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "DlqItem" ADD COLUMN "lockedBy" TEXT;

CREATE INDEX "DlqItem_status_lockedAt_idx" ON "DlqItem"("status", "lockedAt");
