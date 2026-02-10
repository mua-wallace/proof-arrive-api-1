-- Migration: Use subid as the id value for users
-- Changes id from auto-generated UUID to use subid value instead
-- Keeps the id column but populates it with subid

-- ============================================
-- USERS TABLE
-- ============================================

-- 1. First, we need to convert subid to integer if it's currently text
-- Check if subid can be converted to integer
-- Note: This assumes subid values are numeric strings

-- 2. Add a temporary integer column for the new id
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_new" integer;

-- 3. Update the new id column with subid values (convert text to integer)
UPDATE "users" SET "id_new" = CASE 
  WHEN "subid" ~ '^[0-9]+$' THEN "subid"::integer
  ELSE NULL
END;

-- 4. Drop foreign key constraints that reference users (by id or accid)
DO $$
BEGIN
  -- Drop FK from arrivals.created_by (if exists - could reference users.id or users.accid)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname LIKE '%arrivals%created_by%users%'
  ) THEN
    ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_created_by_users_id_fk";
    ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_created_by_users_accid_fk";
  END IF;

  -- Drop FK from exits.created_by (if exists)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname LIKE '%exits%created_by%users%'
  ) THEN
    ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_created_by_users_id_fk";
    ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_created_by_users_accid_fk";
  END IF;

  -- Drop FK from arrivals.agent_id (if exists - could reference users.id or users.accid)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname LIKE '%arrivals%agent_id%users%'
  ) THEN
    ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_agent_id_users_id_fk";
    ALTER TABLE "arrivals" DROP CONSTRAINT IF EXISTS "arrivals_agent_id_users_accid_fk";
  END IF;

  -- Drop FK from exits.agent_id (if exists)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname LIKE '%exits%agent_id%users%'
  ) THEN
    ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_agent_id_users_id_fk";
    ALTER TABLE "exits" DROP CONSTRAINT IF EXISTS "exits_agent_id_users_accid_fk";
  END IF;
END $$;

-- 5. Update foreign key references
-- Note: Currently agent_id and created_by reference users.accid (text)
-- We need to find users by accid and update to use their subid (id_new) as integer
-- First, update arrivals.agent_id - find user by accid and set to their subid (as text first, will convert to integer later)
UPDATE "arrivals" a
SET "agent_id" = u."id_new"::text
FROM "users" u
WHERE a."agent_id" = u."accid" AND u."id_new" IS NOT NULL;

UPDATE "arrivals" a
SET "created_by" = u."id_new"::text
FROM "users" u
WHERE a."created_by" = u."accid" AND u."id_new" IS NOT NULL;

-- Update exits.agent_id and exits.created_by
UPDATE "exits" e
SET "agent_id" = u."id_new"::text
FROM "users" u
WHERE e."agent_id" = u."accid" AND u."id_new" IS NOT NULL;

UPDATE "exits" e
SET "created_by" = u."id_new"::text
FROM "users" u
WHERE e."created_by" = u."accid" AND u."id_new" IS NOT NULL;

-- 6. Drop the old primary key constraint on users.id
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";

-- 7. Drop the old id column (UUID)
ALTER TABLE "users" DROP COLUMN IF EXISTS "id";

-- 8. Rename id_new to id and make it the primary key
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- 9. Change agent_id and created_by columns in arrivals/exits to integer
-- First check if they're text/varchar and need conversion
DO $$
BEGIN
  -- Convert arrivals.agent_id to integer if it's text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'arrivals' AND column_name = 'agent_id' 
    AND data_type IN ('text', 'varchar', 'character varying')
  ) THEN
    ALTER TABLE "arrivals" ALTER COLUMN "agent_id" TYPE integer USING "agent_id"::integer;
  END IF;

  -- Convert arrivals.created_by to integer if it's text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'arrivals' AND column_name = 'created_by' 
    AND data_type IN ('text', 'varchar', 'character varying')
  ) THEN
    ALTER TABLE "arrivals" ALTER COLUMN "created_by" TYPE integer USING "created_by"::integer;
  END IF;

  -- Convert exits.agent_id to integer if it's text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exits' AND column_name = 'agent_id' 
    AND data_type IN ('text', 'varchar', 'character varying')
  ) THEN
    ALTER TABLE "exits" ALTER COLUMN "agent_id" TYPE integer USING "agent_id"::integer;
  END IF;

  -- Convert exits.created_by to integer if it's text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exits' AND column_name = 'created_by' 
    AND data_type IN ('text', 'varchar', 'character varying')
  ) THEN
    ALTER TABLE "exits" ALTER COLUMN "created_by" TYPE integer USING "created_by"::integer;
  END IF;
END $$;

-- 10. Recreate foreign key constraints
-- Note: These reference users.id which is now integer (subid)
DO $$
BEGIN
  -- Arrivals -> Users (agent_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'arrivals_agent_id_users_id_fk'
  ) THEN
    ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_agent_id_users_id_fk"
      FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;

  -- Arrivals -> Users (created_by)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'arrivals_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;

  -- Exits -> Users (agent_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exits_agent_id_users_id_fk'
  ) THEN
    ALTER TABLE "exits" ADD CONSTRAINT "exits_agent_id_users_id_fk"
      FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;

  -- Exits -> Users (created_by)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exits_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "exits" ADD CONSTRAINT "exits_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;
  END IF;
END $$;
