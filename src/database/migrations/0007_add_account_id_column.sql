-- Migration: Add account_id column to all tables for multi-tenant support
-- This makes account_id mandatory (NOT NULL) for proper multi-tenant isolation

-- Step 1: Add account_id column to users table (derive from accid)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_id" integer;

-- Update existing users: convert accid (text) to account_id (integer)
-- Only convert if accid is numeric
UPDATE "users" 
SET "account_id" = CASE 
  WHEN "accid" ~ '^[0-9]+$' THEN "accid"::integer
  ELSE NULL
END
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use a default (shouldn't happen if accid is always numeric)
-- Use 0 as fallback, but this should be reviewed
UPDATE "users" 
SET "account_id" = 0
WHERE "account_id" IS NULL;

-- Make account_id NOT NULL
ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS "idx_users_account" ON "users"("account_id");
CREATE INDEX IF NOT EXISTS "idx_users_account_accid" ON "users"("account_id", "accid");

-- Step 2: Add account_id to arrivals table (derive from agent_id -> users.accid -> account_id)
ALTER TABLE "arrivals" ADD COLUMN IF NOT EXISTS "account_id" integer;

UPDATE "arrivals" a
SET "account_id" = (
  SELECT u."account_id"
  FROM "users" u
  WHERE u."accid" = a."agent_id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "arrivals" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "arrivals" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_arrivals_account" ON "arrivals"("account_id");

-- Step 3: Add account_id to exits table (derive from agent_id -> users.accid -> account_id)
ALTER TABLE "exits" ADD COLUMN IF NOT EXISTS "account_id" integer;

UPDATE "exits" e
SET "account_id" = (
  SELECT u."account_id"
  FROM "users" u
  WHERE u."accid" = e."agent_id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "exits" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "exits" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_exits_account" ON "exits"("account_id");

-- Step 4: Add account_id to incoming_vehicles table (derive from exit_id -> exits.account_id)
ALTER TABLE "incoming_vehicles" ADD COLUMN IF NOT EXISTS "account_id" integer;

UPDATE "incoming_vehicles" iv
SET "account_id" = (
  SELECT e."account_id"
  FROM "exits" e
  WHERE e."id" = iv."exit_id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "incoming_vehicles" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "incoming_vehicles" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_incoming_vehicles_account" ON "incoming_vehicles"("account_id");

-- Step 5: Add account_id to vehicles table
-- Derive from related arrivals/exits, or use first user's account_id as default
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "account_id" integer;

-- Try to get account_id from arrivals first
UPDATE "vehicles" v
SET "account_id" = (
  SELECT a."account_id"
  FROM "arrivals" a
  WHERE a."vehicle_id" = v."id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- If no arrivals, try exits
UPDATE "vehicles" v
SET "account_id" = (
  SELECT e."account_id"
  FROM "exits" e
  WHERE e."vehicle_id" = v."id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "vehicles" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "vehicles" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_vehicles_account" ON "vehicles"("account_id");
CREATE INDEX IF NOT EXISTS "idx_vehicles_account_third_party" ON "vehicles"("account_id", "third_party_id");

-- Step 6: Add account_id to centers table
-- Derive from related arrivals/exits, or use first user's account_id as default
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "account_id" integer;

-- Try to get account_id from arrivals first
UPDATE "centers" c
SET "account_id" = (
  SELECT a."account_id"
  FROM "arrivals" a
  WHERE a."center_id" = c."id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- If no arrivals, try exits
UPDATE "centers" c
SET "account_id" = (
  SELECT e."account_id"
  FROM "exits" e
  WHERE e."center_id" = c."id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "centers" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "centers" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_centers_account" ON "centers"("account_id");
CREATE INDEX IF NOT EXISTS "idx_centers_account_third_party" ON "centers"("account_id", "third_party_id");
CREATE INDEX IF NOT EXISTS "idx_centers_account_siteid" ON "centers"("account_id", "siteid");

-- Step 7: Add account_id to geozones table
-- Derive from related centers, or use first user's account_id as default
ALTER TABLE "geozones" ADD COLUMN IF NOT EXISTS "account_id" integer;

UPDATE "geozones" g
SET "account_id" = (
  SELECT c."account_id"
  FROM "centers" c
  WHERE c."geozone_id" = g."id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "geozones" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "geozones" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_geozones_account" ON "geozones"("account_id");

-- Step 8: Add account_id to processing_stages table
-- Derive from arrival_id -> arrivals.account_id
ALTER TABLE "processing_stages" ADD COLUMN IF NOT EXISTS "account_id" integer;

UPDATE "processing_stages" ps
SET "account_id" = (
  SELECT a."account_id"
  FROM "arrivals" a
  WHERE a."id" = ps."arrival_id"
  LIMIT 1
)
WHERE "account_id" IS NULL;

-- For any remaining NULL values, use the first user's account_id as fallback
UPDATE "processing_stages" 
SET "account_id" = (SELECT "account_id" FROM "users" LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "processing_stages" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_processing_stages_account" ON "processing_stages"("account_id");
