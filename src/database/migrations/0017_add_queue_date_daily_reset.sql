-- Migration: Add queue_date column for daily queue position reset
-- Positions reset daily: each day starts from position 1

-- ============================================
-- ADD queue_date COLUMN TO center_queues
-- ============================================

-- Add queue_date column (defaults to start of queued_at date)
ALTER TABLE "center_queues" ADD COLUMN IF NOT EXISTS "queue_date" timestamp;

-- Set queue_date for existing records (use start of queued_at date)
UPDATE "center_queues" 
SET "queue_date" = DATE_TRUNC('day', "queued_at")
WHERE "queue_date" IS NULL;

-- Set default to current date (start of day)
ALTER TABLE "center_queues" ALTER COLUMN "queue_date" SET DEFAULT DATE_TRUNC('day', CURRENT_TIMESTAMP);
ALTER TABLE "center_queues" ALTER COLUMN "queue_date" SET NOT NULL;

-- Add index for daily queue queries
CREATE INDEX IF NOT EXISTS "idx_center_queues_queue_date" ON "center_queues"("queue_date");

-- Add composite index for daily queue by center and type
CREATE INDEX IF NOT EXISTS "idx_center_queues_center_type_date" ON "center_queues"("center_id", "queue_type", "queue_date", "is_active");
