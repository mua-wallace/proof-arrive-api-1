CREATE TABLE "arrivals" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"vehicle_id" integer NOT NULL,
	"center_id" integer NOT NULL,
	"agent_id" text NOT NULL,
	"qr_code" varchar(255),
	"status" varchar(50) DEFAULT 'arrived',
	"arrived_at" timestamp DEFAULT now() NOT NULL,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"notes" text,
	CONSTRAINT "arrivals_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"name" varchar(255) NOT NULL,
	"address" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"geozone_id" integer,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "centers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "exits" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"vehicle_id" integer NOT NULL,
	"center_id" integer NOT NULL,
	"agent_id" text NOT NULL,
	"exit_type" varchar(50) NOT NULL,
	"destination_center_id" integer,
	"destination_name" varchar(255),
	"exited_at" timestamp DEFAULT now() NOT NULL,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "geozones" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"name" varchar(255) NOT NULL,
	"polygon" jsonb NOT NULL,
	"center_id" integer,
	"radius_meters" integer
);
--> statement-breakpoint
CREATE TABLE "incoming_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"exit_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"destination_center_id" integer NOT NULL,
	"source_center_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'in_transit',
	"estimated_arrival" timestamp,
	"actual_arrival" timestamp,
	"distance_km" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"k_u" text NOT NULL,
	"pid" text NOT NULL,
	"subid" text NOT NULL,
	"partner" text NOT NULL,
	"k_k" text NOT NULL,
	"expire" text NOT NULL,
	"token" text NOT NULL,
	"session" text NOT NULL,
	"accid" text NOT NULL,
	"company" text NOT NULL,
	"username" text NOT NULL,
	"k_p" text NOT NULL,
	"last_login_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" uuid NOT NULL,
	"accid" integer NOT NULL,
	"subid" integer NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"third_party_id" integer NOT NULL,
	"plate" varchar(50) NOT NULL,
	"model" varchar(100),
	"brand" varchar(100),
	"year" integer,
	"tag2" varchar(255),
	"group_id" integer,
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp,
	CONSTRAINT "vehicles_third_party_id_unique" UNIQUE("third_party_id")
);
--> statement-breakpoint
CREATE TABLE "processing_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"arrival_id" integer NOT NULL,
	"stage_type" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_agent_id_users_accid_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("accid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_agent_id_users_accid_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("accid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exits" ADD CONSTRAINT "exits_destination_center_id_centers_id_fk" FOREIGN KEY ("destination_center_id") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD CONSTRAINT "incoming_vehicles_exit_id_exits_id_fk" FOREIGN KEY ("exit_id") REFERENCES "public"."exits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD CONSTRAINT "incoming_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD CONSTRAINT "incoming_vehicles_destination_center_id_centers_id_fk" FOREIGN KEY ("destination_center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_vehicles" ADD CONSTRAINT "incoming_vehicles_source_center_id_centers_id_fk" FOREIGN KEY ("source_center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_arrival_id_arrivals_id_fk" FOREIGN KEY ("arrival_id") REFERENCES "public"."arrivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_arrivals_vehicle" ON "arrivals" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_arrivals_center" ON "arrivals" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "idx_arrivals_agent" ON "arrivals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_arrivals_status" ON "arrivals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_arrivals_arrived_at" ON "arrivals" USING btree ("arrived_at");--> statement-breakpoint
CREATE INDEX "idx_arrivals_qr_code" ON "arrivals" USING btree ("qr_code");--> statement-breakpoint
CREATE INDEX "idx_centers_geozone" ON "centers" USING btree ("geozone_id");--> statement-breakpoint
CREATE INDEX "idx_exits_vehicle" ON "exits" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_exits_center" ON "exits" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "idx_exits_agent" ON "exits" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_exits_destination" ON "exits" USING btree ("destination_center_id");--> statement-breakpoint
CREATE INDEX "idx_exits_exited_at" ON "exits" USING btree ("exited_at");--> statement-breakpoint
CREATE INDEX "idx_geozones_center" ON "geozones" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "idx_incoming_exit" ON "incoming_vehicles" USING btree ("exit_id");--> statement-breakpoint
CREATE INDEX "idx_incoming_vehicle" ON "incoming_vehicles" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_incoming_destination" ON "incoming_vehicles" USING btree ("destination_center_id");--> statement-breakpoint
CREATE INDEX "idx_incoming_status" ON "incoming_vehicles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_incoming_eta" ON "incoming_vehicles" USING btree ("estimated_arrival");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_users_company" ON "users" USING btree ("company");--> statement-breakpoint
CREATE INDEX "idx_users_accid" ON "users" USING btree ("accid");--> statement-breakpoint
CREATE INDEX "idx_users_last_login_at" ON "users" USING btree ("last_login_at");--> statement-breakpoint
CREATE INDEX "idx_vehicles_plate" ON "vehicles" USING btree ("plate");--> statement-breakpoint
CREATE INDEX "idx_vehicles_third_party" ON "vehicles" USING btree ("third_party_id");--> statement-breakpoint
CREATE INDEX "idx_vehicles_group" ON "vehicles" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_processing_arrival" ON "processing_stages" USING btree ("arrival_id");--> statement-breakpoint
CREATE INDEX "idx_processing_status" ON "processing_stages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_processing_type" ON "processing_stages" USING btree ("stage_type");