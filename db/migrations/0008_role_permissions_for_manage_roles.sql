-- Custom migration (ADR 0007, brief users-roles-permissions.md subtask 6): the two permissions of the Manage roles
-- screen, can_view_role and can_edit_role. Only the admin has them (as with the user permissions, the other
-- roles do not manage roles). The names must equal packages/core `PERMISSIONS`; scripts/permissions.test.mjs checks it.
-- This only inserts rows (never deletes or changes any). It needs the first admin to exist: the audit columns
-- are foreign keys to users, and the admin is the owner of these rows. Without one it stops and changes nothing.
DO $$
DECLARE
	admin_id bigint;
BEGIN
	SELECT u."id" INTO admin_id FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
		WHERE r."name" = 'admin' ORDER BY u."id" LIMIT 1;
	IF admin_id IS NULL THEN
		RAISE EXCEPTION 'No admin user yet. Run "npm run db:create-admin" first, then migrate again.';
	END IF;
	INSERT INTO "permissions" ("name", "created_by", "updated_by") VALUES
		('can_view_role', admin_id, admin_id),
		('can_edit_role', admin_id, admin_id);
	INSERT INTO "role_permissions" ("role_id", "permission_id", "created_by", "updated_by")
		SELECT r."id", p."id", admin_id, admin_id FROM "roles" r CROSS JOIN "permissions" p
		WHERE r."name" = 'admin' AND p."name" IN ('can_view_role', 'can_edit_role');
END
$$;
