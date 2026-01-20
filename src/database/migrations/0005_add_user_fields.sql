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

-- Now make role NOT NULL with default
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent';
--> statement-breakpoint

-- Add check constraint to ensure role is one of: 'agent', 'admin', 'manager'
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('agent', 'admin', 'manager'));
--> statement-breakpoint

-- Create indexes for email and role
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");
--> statement-breakpoint
