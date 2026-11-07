-- Custom migration: keep updated_at current on every UPDATE (Drizzle cannot model triggers).
-- Every new table with an updated_at column needs its own trigger line below, added in a new migration.
CREATE FUNCTION "public"."set_updated_at"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "apartments_set_updated_at" BEFORE UPDATE ON "public"."apartments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "reservations_set_updated_at" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
