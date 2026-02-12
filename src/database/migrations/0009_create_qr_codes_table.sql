-- Migration: Create qr_codes table (1:1 with vehicles). References vehicle by third_party_id.
-- One vehicle has at most one QR code; one QR code belongs to one vehicle.

-- 1. Create qr_codes table (vehicle_third_party_id references vehicles.third_party_id)
CREATE TABLE IF NOT EXISTS "qr_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "vehicle_third_party_id" integer NOT NULL,
  "qr_code" varchar(500) NOT NULL,
  "created_at" timestamp,
  "updated_at" timestamp
);

-- 2. Indexes for qr_codes
CREATE INDEX IF NOT EXISTS "idx_qr_codes_account" ON "qr_codes"("account_id");
CREATE INDEX IF NOT EXISTS "idx_qr_codes_vehicle_third_party" ON "qr_codes"("vehicle_third_party_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_qr_codes_account_vehicle_third_party" ON "qr_codes"("account_id", "vehicle_third_party_id");
CREATE INDEX IF NOT EXISTS "idx_qr_codes_qr_code" ON "qr_codes"("qr_code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_qr_codes_account_qr_code" ON "qr_codes"("account_id", "qr_code");

-- 3. Backfill: copy existing qr_code from vehicles (use third_party_id)
INSERT INTO "qr_codes" ("account_id", "vehicle_third_party_id", "qr_code", "created_at", "updated_at")
SELECT "account_id", "third_party_id", "qr_code", COALESCE("updated_at", NOW()), COALESCE("updated_at", NOW())
FROM "vehicles"
WHERE "qr_code" IS NOT NULL
ON CONFLICT ("account_id", "vehicle_third_party_id") DO NOTHING;

-- 4. Drop qr_code column and indexes from vehicles
DROP INDEX IF EXISTS "idx_vehicles_account_qr_code";
DROP INDEX IF EXISTS "idx_vehicles_qr_code";
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "qr_code";
