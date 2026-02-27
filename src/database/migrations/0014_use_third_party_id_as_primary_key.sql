-- Migration: Use geozone_id as the id value for centers; use thirdPartyId for vehicles
-- Centers: id = geozone_id (from Malambi API gzone_id)
-- Vehicles: id = third_party_id

-- ============================================
-- CENTERS TABLE
-- ============================================

-- 1. Update existing centers.id to use geozone_id value (where not null)
UPDATE "centers" SET "id" = "geozone_id" WHERE "geozone_id" IS NOT NULL AND ("id" != "geozone_id" OR "id" IS NULL);
-- Where geozone_id is null, fall back to third_party_id so PK is still valid
UPDATE "centers" SET "id" = "third_party_id" WHERE "geozone_id" IS NULL AND ("id" != "third_party_id" OR "id" IS NULL);

-- 2. Change id column from serial to integer (remove auto-increment)
DROP SEQUENCE IF EXISTS "centers_id_seq" CASCADE;

-- 3. Alter id column to be integer (not serial)
ALTER TABLE "centers" ALTER COLUMN "id" TYPE integer;
ALTER TABLE "centers" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "centers" ALTER COLUMN "id" SET NOT NULL;

-- 4. Application inserts centers with id = geozone_id (gzone_id from Malambi API)

-- ============================================
-- VEHICLES TABLE
-- ============================================

-- 1. Update existing vehicles.id to use third_party_id value
UPDATE "vehicles" SET "id" = "third_party_id" WHERE "id" != "third_party_id" OR "id" IS NULL;

-- 2. Change id column from serial to integer (remove auto-increment)
-- First, drop the sequence if it exists
DROP SEQUENCE IF EXISTS "vehicles_id_seq" CASCADE;

-- 3. Alter id column to be integer (not serial)
ALTER TABLE "vehicles" ALTER COLUMN "id" TYPE integer;
ALTER TABLE "vehicles" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "vehicles" ALTER COLUMN "id" SET NOT NULL;

-- 4. Ensure id matches third_party_id going forward (add constraint if needed)
-- Note: We'll handle this at application level by setting id = third_party_id on insert
