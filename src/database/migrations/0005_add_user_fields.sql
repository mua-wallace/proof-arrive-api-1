-- Migration: Add email, role, and fullname fields to users table
-- Generated manually

-- Add email column (nullable)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);
--> statement-breakpoint

-- Add role column with default value 'agent'
-- Note: Using nullable first, then set defaults, then make NOT NULL to handle existing rows
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20);
--> statement-breakpoint

-- Add fullname column (nullable)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fullname" varchar(255);
--> statement-breakpoint

-- Set default values for existing rows
-- Set fullname from username for existing users
UPDATE "users" SET "fullname" = "username" WHERE "fullname" IS NULL;
--> statement-breakpoint

-- Set default role for existing users
UPDATE "users" SET "role" = 'agent' WHERE "role" IS NULL OR "role" = '';
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint
