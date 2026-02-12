ALTER TABLE "arrivals" DROP CONSTRAINT "arrivals_qr_code_unique";--> statement-breakpoint
ALTER TABLE "centers" DROP CONSTRAINT "centers_name_unique";--> statement-breakpoint
DROP INDEX "idx_arrivals_qr_code";--> statement-breakpoint
ALTER TABLE "arrivals" ADD COLUMN "created_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "third_party_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "siteid" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "fullname" varchar(255);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "geozone" varchar(255);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "manager" varchar(255);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "groupid" integer;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "groupname" varchar(255);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "sitetype" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "distance" integer;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "time1" varchar(10);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "time2" varchar(10);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "saturday" varchar(10);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "sunday" varchar(10);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "breakstart" varchar(10);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "breakstop" varchar(10);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "timeoutin" integer;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "timeoutin_str" varchar(50);--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "timeoutin_muros" integer;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "timeoutin_muros_str" varchar(50);--> statement-breakpoint
ALTER TABLE "exits" ADD COLUMN "created_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD COLUMN "created_by" text NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_arrivals_created_by" ON "arrivals" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_centers_third_party" ON "centers" USING btree ("third_party_id");--> statement-breakpoint
CREATE INDEX "idx_centers_siteid" ON "centers" USING btree ("siteid");--> statement-breakpoint
CREATE INDEX "idx_centers_name" ON "centers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_centers_groupid" ON "centers" USING btree ("groupid");--> statement-breakpoint
CREATE INDEX "idx_exits_created_by" ON "exits" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_incoming_created_by" ON "incoming_vehicles" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "arrivals" DROP COLUMN "qr_code";--> statement-breakpoint
ALTER TABLE "centers" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "centers" DROP COLUMN "latitude";--> statement-breakpoint
ALTER TABLE "centers" DROP COLUMN "longitude";--> statement-breakpoint
ALTER TABLE "centers" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "centers" ADD CONSTRAINT "centers_third_party_id_unique" UNIQUE("third_party_id");--> statement-breakpoint
ALTER TABLE "centers" ADD CONSTRAINT "centers_siteid_unique" UNIQUE("siteid");