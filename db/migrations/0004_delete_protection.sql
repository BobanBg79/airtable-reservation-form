-- Custom migration (ADR 0007): nothing is ever deleted.
-- 1. BEFORE DELETE and BEFORE TRUNCATE triggers on every table refuse for any role, neondb_owner
--    included (TRUNCATE does not fire row-level delete triggers, so it has its own statement trigger).
-- 2. The admin role is protected: it cannot be renamed, deactivated or unprotected, and no admin
--    role_permissions row can be deactivated or moved to another role or permission.
-- A new table needs its own pair of triggers (copy the lines below) in the migration that creates it.
CREATE FUNCTION "public"."refuse_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'Rows are never deleted or truncated (% on %). Set is_active = false instead (ADR 0007).', TG_OP, TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "apartments_refuse_delete" BEFORE DELETE ON "public"."apartments" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "apartments_refuse_truncate" BEFORE TRUNCATE ON "public"."apartments" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "reservations_refuse_delete" BEFORE DELETE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "reservations_refuse_truncate" BEFORE TRUNCATE ON "public"."reservations" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "users_refuse_delete" BEFORE DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "users_refuse_truncate" BEFORE TRUNCATE ON "public"."users" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "roles_refuse_delete" BEFORE DELETE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "roles_refuse_truncate" BEFORE TRUNCATE ON "public"."roles" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "permissions_refuse_delete" BEFORE DELETE ON "public"."permissions" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "permissions_refuse_truncate" BEFORE TRUNCATE ON "public"."permissions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "role_permissions_refuse_delete" BEFORE DELETE ON "public"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE TRIGGER "role_permissions_refuse_truncate" BEFORE TRUNCATE ON "public"."role_permissions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refuse_delete"();--> statement-breakpoint
CREATE FUNCTION "public"."protect_protected_role"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.is_protected AND (NEW.is_protected = false OR NEW.is_active = false OR NEW.name <> OLD.name) THEN
		RAISE EXCEPTION 'The protected role "%" cannot be renamed, deactivated or unprotected (ADR 0007).', OLD.name;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "roles_protect_protected" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_protected_role"();--> statement-breakpoint
CREATE FUNCTION "public"."protect_protected_role_permissions"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF (SELECT "is_protected" FROM "public"."roles" WHERE "id" = OLD.role_id)
		AND (NEW.is_active = false OR NEW.role_id <> OLD.role_id OR NEW.permission_id <> OLD.permission_id) THEN
		RAISE EXCEPTION 'Permissions of a protected role (admin) cannot be deactivated or changed (ADR 0007).';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "role_permissions_protect_protected" BEFORE UPDATE ON "public"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."protect_protected_role_permissions"();
