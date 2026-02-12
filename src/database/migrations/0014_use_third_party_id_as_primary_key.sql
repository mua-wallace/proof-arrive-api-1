-- Migration: Use thirdPartyId as the id value for centers and vehicles
-- Changes id from auto-generated serial to use thirdPartyId value instead
-- Keeps the id column but populates it with thirdPartyId

-- ============================================
-- CENTERS TABLE
-- ============================================

-- 1. Update existing centers.id to use third_party_id value
UPDATE "centers" SET "id" = "third_party_id" WHERE "id" != "third_party_id" OR "id" IS NULL;

-- 2. Change id column from serial to integer (remove auto-increment)
-- First, drop the sequence if it exists
DROP SEQUENCE IF EXISTS "centers_id_seq" CASCADE;

-- 3. Alter id column to be integer (not serial)
ALTER TABLE "centers" ALTER COLUMN "id" TYPE integer;
ALTER TABLE "centers" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "centers" ALTER COLUMN "id" SET NOT NULL;

-- 4. Ensure id matches third_party_id going forward (add constraint if needed)
-- Note: We'll handle this at application level by setting id = third_party_id on insert

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
