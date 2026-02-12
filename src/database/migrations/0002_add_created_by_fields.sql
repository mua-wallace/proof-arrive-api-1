-- Migration: Add createdBy fields to arrivals, exits, and incoming_vehicles tables
-- Generated manually

-- Add created_by column to arrivals table
ALTER TABLE "arrivals" ADD COLUMN IF NOT EXISTS "created_by" text;

-- Set default value for existing rows (use agent_id as created_by)
UPDATE "arrivals" SET "created_by" = "agent_id" WHERE "created_by" IS NULL;

-- Make created_by NOT NULL (no foreign key constraint since accid is not unique, same as agentId)
ALTER TABLE "arrivals" ALTER COLUMN "created_by" SET NOT NULL;

-- Create index for created_by
CREATE INDEX IF NOT EXISTS "idx_arrivals_created_by" ON "arrivals"("created_by");

-- Add created_by column to exits table
ALTER TABLE "exits" ADD COLUMN IF NOT EXISTS "created_by" text;

-- Set default value for existing rows (use agent_id as created_by)
UPDATE "exits" SET "created_by" = "agent_id" WHERE "created_by" IS NULL;

-- Make created_by NOT NULL (no foreign key constraint since accid is not unique, same as agentId)
ALTER TABLE "exits" ALTER COLUMN "created_by" SET NOT NULL;

-- Create index for created_by
CREATE INDEX IF NOT EXISTS "idx_exits_created_by" ON "exits"("created_by");

-- Add created_by column to incoming_vehicles table
ALTER TABLE "incoming_vehicles" ADD COLUMN IF NOT EXISTS "created_by" text;

-- For existing rows, we need to get created_by from the related exit
-- Since exits have created_by, we can use that
UPDATE "incoming_vehicles" iv
SET "created_by" = (
  SELECT e."created_by" 
  FROM "exits" e 
  WHERE e."id" = iv."exit_id"
)
WHERE "created_by" IS NULL;

-- For any remaining NULL values (shouldn't happen if exits exist), use a default
-- We'll use the first user's accid as fallback
UPDATE "incoming_vehicles" 
SET "created_by" = (SELECT "accid" FROM "users" LIMIT 1)
WHERE "created_by" IS NULL;

-- Make created_by NOT NULL (no foreign key constraint since accid is not unique)
ALTER TABLE "incoming_vehicles" ALTER COLUMN "created_by" SET NOT NULL;

-- Create index for created_by
CREATE INDEX IF NOT EXISTS "idx_incoming_created_by" ON "incoming_vehicles"("created_by");

