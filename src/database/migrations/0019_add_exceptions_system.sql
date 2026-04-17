-- Migration: Add exception handling system
-- Adds trip_exceptions, exception_events, exception_photos tables
-- and extends trips table with ETA and rescue-trip fields

-- 1. Extend trips table
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "estimated_arrival_at" TIMESTAMP;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "is_rescue_trip" BOOLEAN DEFAULT false;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "original_trip_id" INTEGER;

-- 2. Create trip_exceptions table
CREATE TABLE IF NOT EXISTS "trip_exceptions" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP DEFAULT now(),
  "updated_at" TIMESTAMP DEFAULT now(),

  "trip_id" INTEGER NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "vehicle_id" INTEGER NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,

  "type" VARCHAR(30) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  "incident_reference" VARCHAR(30),

  "location" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reported_by_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reported_at" TIMESTAMP NOT NULL DEFAULT now(),

  -- Accident fields
  "severity" VARCHAR(20),
  "has_injuries" BOOLEAN,
  "is_cargo_damaged" BOOLEAN,
  "cargo_damage_description" TEXT,
  "is_vehicle_driveable" BOOLEAN,
  "police_report_reference" VARCHAR(100),

  -- Breakdown / repair fields
  "technician_name" VARCHAR(200),
  "technician_phone" VARCHAR(50),
  "estimated_repair_time" VARCHAR(100),

  -- Transfer fields
  "rescue_vehicle_id" INTEGER REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "rescue_trip_id" INTEGER REFERENCES "trips"("id") ON DELETE SET NULL,
  "transfer_location" TEXT,
  "cargo_count_transferred" INTEGER,
  "cargo_condition" VARCHAR(20),

  -- Overdue fields
  "expected_arrival_at" TIMESTAMP,
  "contact_attempts" INTEGER DEFAULT 0,

  -- Escalation fields
  "escalation_reason" VARCHAR(30),
  "escalation_actions" JSONB,

  -- Resolution fields
  "resolved_by_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" TIMESTAMP,
  "resolution_notes" TEXT,
  "repair_description" TEXT,
  "repaired_by" VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_account" ON "trip_exceptions" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_trip" ON "trip_exceptions" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_vehicle" ON "trip_exceptions" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_type" ON "trip_exceptions" ("type");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_status" ON "trip_exceptions" ("status");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_reported_at" ON "trip_exceptions" ("reported_at");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_incident_ref" ON "trip_exceptions" ("incident_reference");
CREATE INDEX IF NOT EXISTS "idx_trip_exceptions_active_account" ON "trip_exceptions" ("account_id", "status");

-- 3. Create exception_events table
CREATE TABLE IF NOT EXISTS "exception_events" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP DEFAULT now(),
  "updated_at" TIMESTAMP DEFAULT now(),

  "exception_id" INTEGER NOT NULL REFERENCES "trip_exceptions"("id") ON DELETE CASCADE,
  "event_type" VARCHAR(50) NOT NULL,
  "description" TEXT,
  "actor_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
  "metadata" JSONB
);

CREATE INDEX IF NOT EXISTS "idx_exception_events_account" ON "exception_events" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_exception_events_exception" ON "exception_events" ("exception_id");
CREATE INDEX IF NOT EXISTS "idx_exception_events_event_type" ON "exception_events" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_exception_events_timestamp" ON "exception_events" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_exception_events_exception_timestamp" ON "exception_events" ("exception_id", "timestamp");

-- 4. Create exception_photos table
CREATE TABLE IF NOT EXISTS "exception_photos" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP DEFAULT now(),
  "updated_at" TIMESTAMP DEFAULT now(),

  "exception_id" INTEGER NOT NULL REFERENCES "trip_exceptions"("id") ON DELETE CASCADE,
  "url" TEXT NOT NULL,
  "filename" VARCHAR(255),
  "label" VARCHAR(30) NOT NULL DEFAULT 'OTHER',
  "taken_at" TIMESTAMP NOT NULL DEFAULT now(),
  "uploaded_by_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "idx_exception_photos_account" ON "exception_photos" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_exception_photos_exception" ON "exception_photos" ("exception_id");
