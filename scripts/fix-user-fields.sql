-- Manual script to fix/add email, role, and fullname columns to users table
-- Run this if the migration failed partially

-- Check and add email column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "email" varchar(255);
        RAISE NOTICE 'Added email column';
    ELSE
        RAISE NOTICE 'Email column already exists';
    END IF;
END $$;

-- Check and add role column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        -- Add as nullable first
        ALTER TABLE "users" ADD COLUMN "role" varchar(20);
        -- Set default for existing rows
        UPDATE "users" SET "role" = 'agent' WHERE "role" IS NULL;
        -- Make NOT NULL with default
        ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
        ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent';
        RAISE NOTICE 'Added role column';
    ELSE
        RAISE NOTICE 'Role column already exists';
        -- Ensure it has the right constraints
        UPDATE "users" SET "role" = 'agent' WHERE "role" IS NULL OR "role" = '';
        ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
        ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent';
    END IF;
END $$;

-- Check and add fullname column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'fullname'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "fullname" varchar(255);
        UPDATE "users" SET "fullname" = "username" WHERE "fullname" IS NULL;
        RAISE NOTICE 'Added fullname column';
    ELSE
        RAISE NOTICE 'Fullname column already exists';
        UPDATE "users" SET "fullname" = "username" WHERE "fullname" IS NULL;
    END IF;
END $$;

-- Add check constraint for role
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('agent', 'admin', 'manager'));

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");

-- Verify the columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('email', 'role', 'fullname')
ORDER BY column_name;
