-- Migration: Create trips, trip_events, and center_queues tables
-- Refactoring from arrivals/exits/processingStages to trips/tripEvents architecture

-- ============================================
-- TRIPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS "trips" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "vehicle_id" integer NOT NULL,
  "origin_center_id" integer NOT NULL,
  "destination_center_id" integer,
  "purpose" varchar(20) NOT NULL DEFAULT 'DELIVERY',
  "status" varchar(20) NOT NULL DEFAULT 'ONGOING',
  "started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp
);

-- Indexes for trips
CREATE INDEX IF NOT EXISTS "idx_trips_account" ON "trips"("account_id");
CREATE INDEX IF NOT EXISTS "idx_trips_vehicle" ON "trips"("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_trips_origin_center" ON "trips"("origin_center_id");
CREATE INDEX IF NOT EXISTS "idx_trips_destination_center" ON "trips"("destination_center_id");
CREATE INDEX IF NOT EXISTS "idx_trips_status" ON "trips"("status");
CREATE INDEX IF NOT EXISTS "idx_trips_started_at" ON "trips"("started_at");
CREATE INDEX IF NOT EXISTS "idx_trips_vehicle_status" ON "trips"("vehicle_id", "status");

-- Foreign keys for trips
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" 
  FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trips" ADD CONSTRAINT "trips_origin_center_id_centers_id_fk" 
  FOREIGN KEY ("origin_center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_center_id_centers_id_fk" 
  FOREIGN KEY ("destination_center_id") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;

-- ============================================
-- TRIP EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS "trip_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "trip_id" integer NOT NULL,
  "center_id" integer NOT NULL,
  "agent_id" integer NOT NULL,
  "event_type" varchar(50) NOT NULL,
  "timestamp" timestamp NOT NULL DEFAULT now(),
  "metadata" jsonb
);

-- Indexes for trip_events
CREATE INDEX IF NOT EXISTS "idx_trip_events_account" ON "trip_events"("account_id");
CREATE INDEX IF NOT EXISTS "idx_trip_events_trip" ON "trip_events"("trip_id");
CREATE INDEX IF NOT EXISTS "idx_trip_events_center" ON "trip_events"("center_id");
CREATE INDEX IF NOT EXISTS "idx_trip_events_agent" ON "trip_events"("agent_id");
CREATE INDEX IF NOT EXISTS "idx_trip_events_event_type" ON "trip_events"("event_type");
CREATE INDEX IF NOT EXISTS "idx_trip_events_timestamp" ON "trip_events"("timestamp");
CREATE INDEX IF NOT EXISTS "idx_trip_events_trip_timestamp" ON "trip_events"("trip_id", "timestamp");

-- Foreign keys for trip_events
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" 
  FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_center_id_centers_id_fk" 
  FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_agent_id_users_id_fk" 
  FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

-- ============================================
-- CENTER QUEUES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS "center_queues" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "center_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "trip_id" integer NOT NULL,
  "queue_type" varchar(20) NOT NULL,
  "position" integer NOT NULL,
  "queued_at" timestamp NOT NULL DEFAULT now(),
  "service_started_at" timestamp,
  "is_active" boolean DEFAULT true
);

-- Indexes for center_queues
CREATE INDEX IF NOT EXISTS "idx_center_queues_account" ON "center_queues"("account_id");
CREATE INDEX IF NOT EXISTS "idx_center_queues_center" ON "center_queues"("center_id");
CREATE INDEX IF NOT EXISTS "idx_center_queues_vehicle" ON "center_queues"("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_center_queues_trip" ON "center_queues"("trip_id");
CREATE INDEX IF NOT EXISTS "idx_center_queues_queue_type" ON "center_queues"("queue_type");
CREATE INDEX IF NOT EXISTS "idx_center_queues_is_active" ON "center_queues"("is_active");
CREATE INDEX IF NOT EXISTS "idx_center_queues_center_type_active" ON "center_queues"("center_id", "queue_type", "is_active");
CREATE INDEX IF NOT EXISTS "idx_center_queues_center_type_position" ON "center_queues"("center_id", "queue_type", "position");

-- Foreign keys for center_queues
ALTER TABLE "center_queues" ADD CONSTRAINT "center_queues_center_id_centers_id_fk" 
  FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "center_queues" ADD CONSTRAINT "center_queues_vehicle_id_vehicles_id_fk" 
  FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "center_queues" ADD CONSTRAINT "center_queues_trip_id_trips_id_fk" 
  FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;

-- ============================================
-- UPDATE VEHICLES TABLE
-- ============================================
-- Rename current_status to status and update default value
DO $$
BEGIN
  -- Rename column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vehicles' AND column_name = 'current_status'
  ) THEN
    ALTER TABLE "vehicles" RENAME COLUMN "current_status" TO "status";
  END IF;
  
  -- Update default value for status column
  ALTER TABLE "vehicles" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
  
  -- Update existing status values to match new enum
  UPDATE "vehicles" SET "status" = 'AVAILABLE' WHERE "status" = 'available';
  UPDATE "vehicles" SET "status" = 'IN_TRANSIT' WHERE "status" = 'in_transit';
  UPDATE "vehicles" SET "status" = 'LOADING' WHERE "status" IN ('in_processing', 'at_center');
  UPDATE "vehicles" SET "status" = 'AVAILABLE' WHERE "status" IN ('in_garage', 'unavailable');
END $$;
