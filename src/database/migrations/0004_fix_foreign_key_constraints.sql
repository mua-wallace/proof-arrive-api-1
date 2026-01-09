-- Migration: Fix foreign key constraints to match schema definitions
-- The schema defines references to thirdPartyId and geozoneId, but migrations created constraints to id
-- This migration fixes the foreign key constraints to match the actual schema

-- Drop old foreign key constraints that reference wrong columns
-- Note: incoming_vehicles correctly references centers.id and vehicles.id, so we don't change those
ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_vehicle_id_vehicles_id_fk";
ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_center_id_centers_id_fk";
ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_vehicle_id_vehicles_id_fk";
ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_center_id_centers_id_fk";
ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_destination_center_id_centers_id_fk";

-- Add correct foreign key constraints matching the schema
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
