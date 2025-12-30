-- Migration: Add status column to exits table
-- Generated manually

-- Add status column to exits table
ALTER TABLE "exits" ADD COLUMN IF NOT EXISTS "status" varchar(50);

-- Create index for status
CREATE INDEX IF NOT EXISTS "idx_exits_status" ON "exits"("status");

