-- Migration: Create vehicle_groups table
-- Stores vehicle groups synced from Malambi API

-- 1. Create vehicle_groups table
CREATE TABLE IF NOT EXISTS "vehicle_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "group_id" integer NOT NULL,
  "group_name" varchar(255) NOT NULL
);

-- 2. Indexes and unique constraints for vehicle_groups
CREATE INDEX IF NOT EXISTS "idx_vehicle_groups_account" ON "vehicle_groups"("account_id");
CREATE INDEX IF NOT EXISTS "idx_vehicle_groups_group_id" ON "vehicle_groups"("group_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_groups_account_group_id" ON "vehicle_groups"("account_id", "group_id"); -- Unique groupId per account

-- 3. Add unique constraint on vehicles (accountId, thirdPartyId) if not exists
-- Drop old global unique constraint if it exists
DROP INDEX IF EXISTS "vehicles_third_party_id_unique";
-- Add account-scoped unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicles_account_third_party" ON "vehicles"("account_id", "third_party_id");

-- 4. Add foreign key constraint from vehicles.group_id to vehicle_groups.id
-- Note: This is done after table creation to allow existing vehicles without groups
-- PostgreSQL doesn't support IF NOT EXISTS for ADD CONSTRAINT, so we check first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_vehicles_group'
  ) THEN
    ALTER TABLE "vehicles" 
      ADD CONSTRAINT "fk_vehicles_group" 
      FOREIGN KEY ("group_id") 
      REFERENCES "vehicle_groups"("id") 
      ON DELETE SET NULL;
  END IF;
END $$;
