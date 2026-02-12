-- Migration: Add vehicle status and location tracking
-- Adds currentStatus and currentCenterId to vehicles table
-- Creates vehicle_status_history table for tracking status changes over time

-- 1. Add current_status and current_center_id columns to vehicles table
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "current_status" varchar(50) DEFAULT 'available';
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "current_center_id" integer;

-- 2. Add indexes for status and center queries
CREATE INDEX IF NOT EXISTS "idx_vehicles_status" ON "vehicles"("current_status");
CREATE INDEX IF NOT EXISTS "idx_vehicles_current_center" ON "vehicles"("current_center_id");

-- 3. Add foreign key constraint for current_center_id
-- PostgreSQL doesn't support IF NOT EXISTS for ADD CONSTRAINT, so we check first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vehicles_current_center'
  ) THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "fk_vehicles_current_center"
      FOREIGN KEY ("current_center_id")
      REFERENCES "centers"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create vehicle_status_history table
CREATE TABLE IF NOT EXISTS "vehicle_status_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "vehicle_id" integer NOT NULL,
  "status" varchar(50) NOT NULL,
  "center_id" integer,
  "changed_by" text,
  "notes" text,
  "changed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "vehicle_status_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE cascade
);

-- 5. Add indexes for vehicle_status_history table
CREATE INDEX IF NOT EXISTS "idx_vehicle_status_history_vehicle" ON "vehicle_status_history"("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_status_history_status" ON "vehicle_status_history"("status");
CREATE INDEX IF NOT EXISTS "idx_vehicle_status_history_center" ON "vehicle_status_history"("center_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_status_history_changed_at" ON "vehicle_status_history"("changed_at");
CREATE INDEX IF NOT EXISTS "idx_vehicle_status_history_account_vehicle" ON "vehicle_status_history"("account_id", "vehicle_id");

-- 6. Add foreign key constraint for center_id in vehicle_status_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vehicle_status_history_center'
  ) THEN
    ALTER TABLE "vehicle_status_history"
      ADD CONSTRAINT "fk_vehicle_status_history_center"
      FOREIGN KEY ("center_id")
      REFERENCES "centers"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 7. Initialize current_status for existing vehicles based on their latest arrival/exit
-- Set vehicles to 'available' if no recent activity, or 'at_center' if they have a recent arrival without exit
UPDATE "vehicles" v
SET 
  "current_status" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "arrivals" a
      WHERE a."vehicle_id" = v."third_party_id"
        AND a."account_id" = v."account_id"
        AND NOT EXISTS (
          SELECT 1 FROM "exits" e
          WHERE e."vehicle_id" = v."third_party_id"
            AND e."account_id" = v."account_id"
            AND e."exited_at" > a."arrived_at"
        )
    ) THEN 'at_center'
    ELSE 'available'
  END,
  "current_center_id" = (
    SELECT c."id"
    FROM "arrivals" a
    JOIN "centers" c ON c."geozone_id" = a."center_id" AND c."account_id" = a."account_id"
    WHERE a."vehicle_id" = v."third_party_id"
      AND a."account_id" = v."account_id"
      AND NOT EXISTS (
        SELECT 1 FROM "exits" e
        WHERE e."vehicle_id" = v."third_party_id"
          AND e."account_id" = v."account_id"
          AND e."exited_at" > a."arrived_at"
      )
    ORDER BY a."arrived_at" DESC
    LIMIT 1
  )
WHERE v."current_status" IS NULL OR v."current_status" = 'available';
