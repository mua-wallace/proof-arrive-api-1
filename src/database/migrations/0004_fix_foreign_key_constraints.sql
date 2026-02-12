-- Migration: Fix foreign key constraints to match schema definitions
-- This migration:
-- 1. Makes geozone_id unique in centers table (required for foreign key constraints)
-- 2. Fixes vehicle_id foreign keys to reference vehicles.third_party_id instead of vehicles.id
-- 3. Fixes center_id foreign keys to reference centers.geozone_id instead of centers.id

-- Step 1: Ensure unique constraints exist for foreign key references
-- First, make vehicles.third_party_id unique (required for foreign keys)
-- Handle duplicates by keeping the one with the lowest id
DO $$
BEGIN
    -- Check if there are duplicate third_party_ids in vehicles
    IF EXISTS (
        SELECT 1 FROM "vehicles" 
        WHERE "third_party_id" IS NOT NULL 
        GROUP BY "third_party_id" 
        HAVING COUNT(*) > 1
    ) THEN
        -- Delete duplicates, keeping the one with the lowest id
        DELETE FROM "vehicles" v1
        WHERE EXISTS (
            SELECT 1 FROM "vehicles" v2
            WHERE v2."third_party_id" = v1."third_party_id"
            AND v2."third_party_id" IS NOT NULL
            AND v2."id" < v1."id"
        );
    END IF;
END $$;

-- Add unique constraint on vehicles.third_party_id (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'vehicles_third_party_id_unique'
    ) THEN
        ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_third_party_id_unique" UNIQUE("third_party_id");
    END IF;
END $$;

-- Step 1b: Make geozone_id unique in centers table (required for foreign key constraints)
-- First, handle any potential duplicates by keeping only one record per geozone_id
-- If there are duplicates, we'll keep the one with the lowest id
DO $$
BEGIN
    -- Check if there are duplicate geozone_ids
    IF EXISTS (
        SELECT 1 FROM "centers" 
        WHERE "geozone_id" IS NOT NULL 
        GROUP BY "geozone_id" 
        HAVING COUNT(*) > 1
    ) THEN
        -- Delete duplicates, keeping the one with the lowest id
        DELETE FROM "centers" c1
        WHERE EXISTS (
            SELECT 1 FROM "centers" c2
            WHERE c2."geozone_id" = c1."geozone_id"
            AND c2."geozone_id" IS NOT NULL
            AND c2."id" < c1."id"
        );
    END IF;
END $$;

-- Add unique constraint on geozone_id (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'centers_geozone_id_unique'
    ) THEN
        ALTER TABLE "centers" ADD CONSTRAINT "centers_geozone_id_unique" UNIQUE("geozone_id");
    END IF;
END $$;

-- Step 2: Drop old foreign key constraints that reference wrong columns
ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_vehicle_id_vehicles_id_fk";
ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_center_id_centers_id_fk";
ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_vehicle_id_vehicles_id_fk";
ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_center_id_centers_id_fk";
ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_destination_center_id_centers_id_fk";

-- Step 3: Add correct foreign key constraints
-- Arrivals: vehicle_id references vehicles.third_party_id
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_vehicle_id_vehicles_third_party_id_fk" 
  FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("third_party_id") 
  ON DELETE cascade ON UPDATE no action;

-- Arrivals: center_id references centers.geozone_id
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_center_id_centers_geozone_id_fk" 
  FOREIGN KEY ("center_id") REFERENCES "public"."centers"("geozone_id") 
  ON DELETE restrict ON UPDATE no action;

-- Exits: vehicle_id references vehicles.third_party_id
ALTER TABLE "exits" ADD CONSTRAINT "exits_vehicle_id_vehicles_third_party_id_fk" 
  FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("third_party_id") 
  ON DELETE cascade ON UPDATE no action;

-- Exits: center_id references centers.geozone_id
ALTER TABLE "exits" ADD CONSTRAINT "exits_center_id_centers_geozone_id_fk" 
  FOREIGN KEY ("center_id") REFERENCES "public"."centers"("geozone_id") 
  ON DELETE restrict ON UPDATE no action;

-- Exits: destination_center_id references centers.geozone_id
ALTER TABLE "exits" ADD CONSTRAINT "exits_destination_center_id_centers_geozone_id_fk" 
  FOREIGN KEY ("destination_center_id") REFERENCES "public"."centers"("geozone_id") 
  ON DELETE set null ON UPDATE no action;

-- Note: incoming_vehicles correctly references centers.id (not geozone_id) and vehicles.id (not third_party_id)
-- These constraints are already correct in the original migration, so we don't change them
