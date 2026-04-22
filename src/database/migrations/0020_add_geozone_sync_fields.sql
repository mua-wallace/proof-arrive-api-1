-- Migration: Add Malambi sync fields to geozones table
-- Adds third_party_id (Malambi zone `i`), color, speed_limit
-- Backfills existing rows' third_party_id with their internal id
-- Adds indexes + unique (account_id, third_party_id)

-- 1. Add columns (nullable so we can backfill)
ALTER TABLE "geozones" ADD COLUMN IF NOT EXISTS "third_party_id" integer;
ALTER TABLE "geozones" ADD COLUMN IF NOT EXISTS "color" varchar(20);
ALTER TABLE "geozones" ADD COLUMN IF NOT EXISTS "speed_limit" integer;

-- 2. Backfill third_party_id from id for any pre-existing rows
UPDATE "geozones" SET "third_party_id" = "id" WHERE "third_party_id" IS NULL;

-- 3. Enforce NOT NULL on third_party_id
ALTER TABLE "geozones" ALTER COLUMN "third_party_id" SET NOT NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS "idx_geozones_third_party" ON "geozones" USING btree ("third_party_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_geozones_account_third_party" ON "geozones" USING btree ("account_id", "third_party_id");
