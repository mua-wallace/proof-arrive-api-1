ALTER TABLE "centers" DROP CONSTRAINT "centers_third_party_id_unique";--> statement-breakpoint
ALTER TABLE "centers" DROP CONSTRAINT "centers_siteid_unique";--> statement-breakpoint
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_third_party_id_unique";--> statement-breakpoint
ALTER TABLE "arrivals" DROP CONSTRAINT "arrivals_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "arrivals" DROP CONSTRAINT "arrivals_center_id_centers_id_fk";
--> statement-breakpoint
ALTER TABLE "exits" DROP CONSTRAINT "exits_vehicle_id_vehicles_id_fk";
--> statement-breakpoint
ALTER TABLE "exits" DROP CONSTRAINT "exits_center_id_centers_id_fk";
--> statement-breakpoint
ALTER TABLE "exits" DROP CONSTRAINT "exits_destination_center_id_centers_id_fk";
--> statement-breakpoint
ALTER TABLE "arrivals" ALTER COLUMN "status" SET DEFAULT 'arrival';--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "processing_stages" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
-- Add account_id columns (nullable first, then set defaults, then make NOT NULL)
ALTER TABLE "arrivals" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "exits" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "exits" ADD COLUMN IF NOT EXISTS "status" varchar(50);--> statement-breakpoint
ALTER TABLE "geozones" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
ALTER TABLE "processing_stages" ADD COLUMN IF NOT EXISTS "account_id" integer;--> statement-breakpoint
-- Set default value of 0 for existing rows (if any)
UPDATE "arrivals" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "centers" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "exits" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "geozones" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "incoming_vehicles" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "users" SET "account_id" = CAST("accid" AS integer) WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "vehicles" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
UPDATE "processing_stages" SET "account_id" = 0 WHERE "account_id" IS NULL;--> statement-breakpoint
-- Now make columns NOT NULL
ALTER TABLE "arrivals" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exits" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "geozones" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_stages" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_vehicle_id_vehicles_third_party_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("third_party_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_center_id_centers_geozone_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("geozone_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_vehicle_id_vehicles_third_party_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("third_party_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_center_id_centers_geozone_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("geozone_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_destination_center_id_centers_geozone_id_fk" FOREIGN KEY ("destination_center_id") REFERENCES "public"."centers"("geozone_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_arrivals_account" ON "arrivals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_centers_account" ON "centers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_centers_account_third_party" ON "centers" USING btree ("account_id","third_party_id");--> statement-breakpoint
CREATE INDEX "idx_centers_account_siteid" ON "centers" USING btree ("account_id","siteid");--> statement-breakpoint
CREATE INDEX "idx_exits_account" ON "exits" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_exits_status" ON "exits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_geozones_account" ON "geozones" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_incoming_account" ON "incoming_vehicles" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_account" ON "vehicles" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_account_third_party" ON "vehicles" USING btree ("account_id","third_party_id");--> statement-breakpoint
CREATE INDEX "idx_processing_account" ON "processing_stages" USING btree ("account_id");