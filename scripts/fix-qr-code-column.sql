-- Fix script to add qr_code column to vehicles table
-- Run this directly if the migration didn't work

-- Add qr_code column (nullable, stores the vehicleId as string)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "qr_code" varchar(500);

-- Create index for qr_code lookups
CREATE INDEX IF NOT EXISTS "idx_vehicles_qr_code" ON "vehicles"("qr_code");

-- Create composite index for accountId + qrCode queries
CREATE INDEX IF NOT EXISTS "idx_vehicles_account_qr_code" ON "vehicles"("account_id", "qr_code");
