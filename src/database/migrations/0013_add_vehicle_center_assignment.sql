-- Migration: Add center assignment to vehicles
-- Adds centerId field to vehicles table for center assignment (separate from currentCenterId which tracks location)
-- A vehicle can be assigned to one center (or none), and can be updated later

-- 1. Add center_id column to vehicles table (nullable, for assignment)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "center_id" integer;

-- 2. Add index for center assignment queries
CREATE INDEX IF NOT EXISTS "idx_vehicles_center_assignment" ON "vehicles"("center_id");

-- 3. Add foreign key constraint for center_id (assignment)
-- PostgreSQL doesn't support IF NOT EXISTS for ADD CONSTRAINT, so we check first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vehicles_center_assignment'
  ) THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "fk_vehicles_center_assignment"
      FOREIGN KEY ("center_id")
      REFERENCES "centers"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Set center_id to NULL for all existing vehicles (initial state)
UPDATE "vehicles" SET "center_id" = NULL WHERE "center_id" IS NOT NULL;
