-- Migration: Add trip phase for explicit state on trip
-- Enables trip-centric API: GET /trips/:id returns phase; actions update phase + create events

ALTER TABLE "trips"
  ADD COLUMN IF NOT EXISTS "phase" varchar(50) NOT NULL DEFAULT 'AT_ORIGIN_ARRIVED';

-- Backfill: completed trips get phase COMPLETED
UPDATE "trips"
  SET "phase" = 'COMPLETED'
  WHERE "status" = 'COMPLETED';

CREATE INDEX IF NOT EXISTS "idx_trips_phase" ON "trips"("phase");
CREATE INDEX IF NOT EXISTS "idx_trips_vehicle_phase" ON "trips"("vehicle_id", "phase");

COMMENT ON COLUMN "trips"."phase" IS 'Lifecycle phase: AT_ORIGIN_ARRIVED, AT_ORIGIN_LOADING, AT_ORIGIN_LOADING_ENDED, READY_TO_EXIT, IN_TRANSIT, AT_DESTINATION_ARRIVED, AT_DESTINATION_UNLOADING, AT_DESTINATION_UNLOADING_ENDED, COMPLETED';
