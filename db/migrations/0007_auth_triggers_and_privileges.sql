-- Custom migration (ADR 0007, docs/briefs/authentication.md): triggers and privileges of the two
-- authentication tables created by the previous migration.
-- 1. sessions: keep updated_at current.
-- 2. Both tables: BEFORE DELETE and BEFORE TRUNCATE triggers refuse for any role (the function
--    refuse_delete() comes from migration 0004). Sessions are ended with is_active = false, never deleted.
-- 3. login_attempts is insert only: delta_app keeps INSERT and SELECT but loses the UPDATE that the default
--    privileges (ADR 0002) would give it. Rows are never changed.
CREATE TRIGGER "sessions_set_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "sessions_refuse_delete" BEFORE DELETE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "sessions_refuse_truncate" BEFORE TRUNCATE ON "public"."sessions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "login_attempts_refuse_delete" BEFORE DELETE ON "public"."login_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "login_attempts_refuse_truncate" BEFORE TRUNCATE ON "public"."login_attempts" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
REVOKE UPDATE ON "public"."login_attempts" FROM "delta_app";
