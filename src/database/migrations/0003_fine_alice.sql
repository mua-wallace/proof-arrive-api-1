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
ALTER TABLE "arrivals" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "exits" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "exits" ADD COLUMN "status" varchar(50);--> statement-breakpoint
ALTER TABLE "geozones" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_stages" ADD COLUMN "account_id" integer NOT NULL;--> statement-breakpoint
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