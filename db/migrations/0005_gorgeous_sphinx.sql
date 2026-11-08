-- Audit columns become foreign keys to users (ADR 0007), converted IN PLACE: ALTER COLUMN ... TYPE ... USING,
-- never a new column plus a dropped old one. Drizzle generated `SET DATA TYPE bigint` without USING, which
-- cannot convert text; the first part below is written by hand, the foreign keys are as generated.
-- Needs the first admin to exist (`npm run db:create-admin`); otherwise the migration stops with a message
-- and changes nothing (the whole file is one transaction).
--
-- 1. The `dev-seed` system user owns the seed rows. It cannot sign in: it is inactive, has a password
--    hash that is not a bcrypt hash, and the role with no permissions.
-- 2. Old text values: 'dev-seed' becomes the dev-seed user, every other value ('migration',
--    'create-admin', ...) becomes the first admin.
INSERT INTO "users" ("email", "password_hash", "first_name", "last_name", "role_id", "is_active", "created_by", "updated_by")
	SELECT 'dev-seed@system.local', '!no-login', 'Dev', 'Seed', r."id", false, 'migration', 'migration'
	FROM "roles" r WHERE r."name" = 'cleaning_lady'
	ON CONFLICT ("email") DO NOTHING;--> statement-breakpoint
DO $$
DECLARE
	admin_id bigint;
	seed_id bigint;
	tbl text;
	col text;
BEGIN
	SELECT u."id" INTO admin_id FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
		WHERE r."name" = 'admin' ORDER BY u."id" LIMIT 1;
	IF admin_id IS NULL THEN
		RAISE EXCEPTION 'No admin user yet. Run "npm run db:create-admin" first, then migrate again.';
	END IF;
	SELECT "id" INTO seed_id FROM "users" WHERE "email" = 'dev-seed@system.local';
	FOREACH tbl IN ARRAY ARRAY['apartments', 'reservations', 'roles', 'permissions', 'role_permissions', 'users'] LOOP
		FOREACH col IN ARRAY ARRAY['created_by', 'updated_by'] LOOP
			EXECUTE format(
				'ALTER TABLE %I ALTER COLUMN %I TYPE bigint USING (CASE WHEN %I = ''dev-seed'' THEN %s ELSE %s END)',
				tbl, col, col, seed_id, admin_id);
		END LOOP;
	END LOOP;
END
$$;--> statement-breakpoint
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;