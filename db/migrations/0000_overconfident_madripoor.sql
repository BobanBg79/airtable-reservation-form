CREATE TYPE "public"."reservation_channel" AS ENUM('direct', 'booking', 'airbnb', 'local_agency');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "apartments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "apartments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"address" text NOT NULL,
	"apartment_number" text NOT NULL,
	"floor" integer NOT NULL,
	"building_name" text NOT NULL,
	"area_m2" integer NOT NULL,
	"owner_name" text NOT NULL,
	"owner_phone" text NOT NULL,
	"monthly_rent_eur" integer NOT NULL,
	"has_bathtub" boolean DEFAULT false NOT NULL,
	"has_terrace" boolean DEFAULT false NOT NULL,
	"has_dishwasher" boolean DEFAULT false NOT NULL,
	"parking_spot" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "apartments_name_unique" UNIQUE("name"),
	CONSTRAINT "apartments_area_m2_positive" CHECK ("apartments"."area_m2" > 0),
	CONSTRAINT "apartments_owner_phone_format" CHECK ("apartments"."owner_phone" ~ '^[+]?[0-9]{6,15}$'),
	CONSTRAINT "apartments_monthly_rent_eur_non_negative" CHECK ("apartments"."monthly_rent_eur" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"apartment_id" bigint NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"channel" "reservation_channel" NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text NOT NULL,
	"note" text,
	"total_amount_eur" numeric(10, 2) NOT NULL,
	"price_per_night_eur" numeric(10, 2) GENERATED ALWAYS AS (round("reservations"."total_amount_eur" / ("reservations"."check_out_date" - "reservations"."check_in_date"), 2)) STORED NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "reservations_check_out_after_check_in" CHECK ("reservations"."check_out_date" > "reservations"."check_in_date"),
	CONSTRAINT "reservations_guest_phone_format" CHECK ("reservations"."guest_phone" ~ '^[+]?[0-9]{6,15}$'),
	CONSTRAINT "reservations_total_amount_eur_non_negative" CHECK ("reservations"."total_amount_eur" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_apartment_dates_idx" ON "reservations" USING btree ("apartment_id","check_in_date","check_out_date");