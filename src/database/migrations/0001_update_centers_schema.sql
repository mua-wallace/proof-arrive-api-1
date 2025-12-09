-- Migration: Update centers schema to match Malambi API structure
-- Generated manually

-- Add new columns first (allowing NULL initially to handle existing data)
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "third_party_id" integer;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "siteid" integer;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "fullname" varchar(255);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "geozone" varchar(255);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "manager" varchar(255);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "groupid" integer;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "groupname" varchar(255);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "sitetype" integer DEFAULT 0;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "distance" integer;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "time1" varchar(10);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "time2" varchar(10);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "saturday" varchar(10);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "sunday" varchar(10);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "breakstart" varchar(10);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "breakstop" varchar(10);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "timeoutin" integer;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "timeoutin_str" varchar(50);
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "timeoutin_muros" integer;
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "timeoutin_muros_str" varchar(50);

-- For existing rows, set default values for NOT NULL columns
-- Using id as temporary third_party_id and siteid (will be updated when syncing from API)
UPDATE "centers" SET "third_party_id" = "id", "siteid" = "id" WHERE "third_party_id" IS NULL;

-- Now make columns NOT NULL
ALTER TABLE "centers" ALTER COLUMN "third_party_id" SET NOT NULL;
ALTER TABLE "centers" ALTER COLUMN "siteid" SET NOT NULL;

-- Drop old columns that are no longer needed (only if they exist)
ALTER TABLE "centers" DROP COLUMN IF EXISTS "address";
ALTER TABLE "centers" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "centers" DROP COLUMN IF EXISTS "longitude";
ALTER TABLE "centers" DROP COLUMN IF EXISTS "is_active";

-- Drop old unique constraint on name (if it exists)
ALTER TABLE "centers" DROP CONSTRAINT IF EXISTS "centers_name_unique";

-- Add unique constraints (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'centers_third_party_id_unique'
    ) THEN
        ALTER TABLE "centers" ADD CONSTRAINT "centers_third_party_id_unique" UNIQUE("third_party_id");
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'centers_siteid_unique'
    ) THEN
        ALTER TABLE "centers" ADD CONSTRAINT "centers_siteid_unique" UNIQUE("siteid");
    END IF;
END $$;

-- Create indexes (using IF NOT EXISTS is handled by CREATE INDEX IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "idx_centers_third_party" ON "centers"("third_party_id");
CREATE INDEX IF NOT EXISTS "idx_centers_siteid" ON "centers"("siteid");
CREATE INDEX IF NOT EXISTS "idx_centers_name" ON "centers"("name");
-- geozone_id index already exists, but ensure groupid index exists
CREATE INDEX IF NOT EXISTS "idx_centers_groupid" ON "centers"("groupid");

