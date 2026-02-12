-- Manual SQL script to run migration 0005_add_user_fields.sql
-- This adds email, role, and fullname columns to the users table
-- 
-- Usage:
--   psql -h localhost -U postgres -d proof_arrive -f scripts/run-migration-0005-manual.sql
-- 
-- Or with Docker:
--   docker-compose exec proof-arrive-postgres psql -U postgres -d proof_arrive -f /path/to/run-migration-0005-manual.sql
--   OR copy file into container and run:
--   docker-compose exec proof-arrive-postgres psql -U postgres -d proof_arrive < scripts/run-migration-0005-manual.sql

-- Check if columns already exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' 
        AND table_name='users' 
        AND column_name IN ('email', 'role', 'fullname')
    ) THEN
        RAISE NOTICE 'Columns email, role, fullname already exist. Migration already applied.';
        RETURN;
    END IF;
END $$;

-- Add email column (nullable)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);

-- Add role column with default value 'agent'
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20);

-- Add fullname column (nullable)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fullname" varchar(255);

-- Set default values for existing rows
-- Set fullname from username for existing users
UPDATE "users" SET "fullname" = "username" WHERE "fullname" IS NULL;

-- Set default role for existing users
UPDATE "users" SET "role" = 'agent' WHERE "role" IS NULL OR "role" = '';

-- Now make role NOT NULL with default (only if column exists)
DO $$
BEGIN
    -- Check if role column exists and is nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'role' 
        AND is_nullable = 'YES'
    ) THEN
        -- Set any remaining NULLs to 'agent'
        UPDATE "users" SET "role" = 'agent' WHERE "role" IS NULL OR "role" = '';
        -- Make NOT NULL
        ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
        -- Set default
        ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent';
    END IF;
END $$;

-- Add check constraint to ensure role is one of: 'agent', 'admin', 'manager' (only if column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
        ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('agent', 'admin', 'manager'));
    END IF;
END $$;

-- Create indexes for email and role (only if columns exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'email'
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'role'
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");
    END IF;
END $$;

-- Verify columns were added
DO $$
DECLARE
    found_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO found_count
    FROM information_schema.columns 
    WHERE table_schema='public' 
    AND table_name='users' 
    AND column_name IN ('email', 'role', 'fullname');
    
    IF found_count = 3 THEN
        RAISE NOTICE 'SUCCESS: All columns (email, role, fullname) have been added!';
    ELSE
        RAISE WARNING 'WARNING: Only % columns found. Expected 3 columns (email, role, fullname).', found_count;
    END IF;
END $$;
