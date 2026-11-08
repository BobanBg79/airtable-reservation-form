-- Custom migration (ADR 0007): updated_at triggers for the access tables and the reference data
-- (5 roles, 19 permissions, the initial role sets). The names must equal packages/core
-- `ROLES`, `PERMISSIONS` and `INITIAL_ROLE_PERMISSIONS`; scripts/permissions.test.mjs checks it.
-- Every later migration that adds a permission must also grant it to admin.
CREATE TRIGGER "roles_set_updated_at" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "permissions_set_updated_at" BEFORE UPDATE ON "public"."permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "role_permissions_set_updated_at" BEFORE UPDATE ON "public"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
INSERT INTO "roles" ("name", "description", "is_protected", "created_by", "updated_by") VALUES
	('admin', 'Every permission. The only role that manages users and the permissions of other roles. Its own permissions are fixed.', true, 'migration', 'migration'),
	('business_owner', 'Sees owner contact and finance data', false, 'migration', 'migration'),
	('manager', 'Enters and manages reservations', false, 'migration', 'migration'),
	('cleaning_lady', 'Cleaning staff (no permissions yet)', false, 'migration', 'migration'),
	('handyman', 'Maintenance (no permissions yet)', false, 'migration', 'migration');--> statement-breakpoint
INSERT INTO "permissions" ("name", "created_by", "updated_by") VALUES
	('can_view_apartment', 'migration', 'migration'),
	('can_create_apartment', 'migration', 'migration'),
	('can_edit_apartment', 'migration', 'migration'),
	('can_view_reservation', 'migration', 'migration'),
	('can_create_reservation', 'migration', 'migration'),
	('can_edit_reservation', 'migration', 'migration'),
	('can_view_guest', 'migration', 'migration'),
	('can_create_guest', 'migration', 'migration'),
	('can_edit_guest', 'migration', 'migration'),
	('can_view_cleaning', 'migration', 'migration'),
	('can_create_cleaning', 'migration', 'migration'),
	('can_edit_cleaning', 'migration', 'migration'),
	('can_view_user', 'migration', 'migration'),
	('can_create_user', 'migration', 'migration'),
	('can_edit_user', 'migration', 'migration'),
	('can_view_apartment_owner_contact', 'migration', 'migration'),
	('can_edit_apartment_owner_contact', 'migration', 'migration'),
	('can_view_apartment_rent', 'migration', 'migration'),
	('can_edit_apartment_rent', 'migration', 'migration');--> statement-breakpoint
-- admin: all 19
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_by", "updated_by")
	SELECT r."id", p."id", 'migration', 'migration' FROM "roles" r CROSS JOIN "permissions" p WHERE r."name" = 'admin';--> statement-breakpoint
-- business_owner and manager: everything except the three user permissions (16)
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_by", "updated_by")
	SELECT r."id", p."id", 'migration', 'migration' FROM "roles" r CROSS JOIN "permissions" p
	WHERE r."name" IN ('business_owner', 'manager') AND p."name" NOT IN ('can_view_user', 'can_create_user', 'can_edit_user');
