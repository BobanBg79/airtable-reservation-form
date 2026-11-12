// The logic of the Manage roles routes, after the guard has let the caller in (the route files in api/roles/ are
// thin: `export default protect('can_...', handleX)`). The SQL client and the caller (`auth`) are passed in, so
// the handlers can be tested without a database.
//
// A role's permissions are rows of role_permissions. Taking a permission away from a role sets that row's
// is_active to false; giving it back sets it to true again (a new row only when the pair never existed). Nothing
// is ever deleted (ADR 0007), and the permissions table itself is never touched here.
import { loadPermissionNames, loadRolesWithPermissions } from './_pgReads.js';
import { adminOnlyAmong, validateRoleEdit } from './_roleInput.js';

function allow(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  res.status(405).json({ error: 'Method not allowed.' });
  return false;
}

/** GET /api/roles/permissions (can_view_role): every permission name, and each role with the names it has now. */
export async function handleRolePermissions(req, res, { sql }) {
  if (!allow(req, res, 'GET')) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [permissions, roles] = await Promise.all([loadPermissionNames(sql), loadRolesWithPermissions(sql)]);
    res.json({ permissions, roles });
  } catch (e) {
    console.error('role permissions failed:', e?.code ?? e?.name ?? 'error');
    res.status(500).json({ error: 'Could not load roles.' });
  }
}

/**
 * POST /api/roles/edit (can_edit_role). Body: id and permissions, the complete new set of the role's permission
 * names. The admin role cannot be changed (403; the database trigger is the last line of defence), and the
 * admin-only permissions (users and roles) can never be given to another role (403). 200 with the updated role.
 */
export async function handleEditRole(req, res, { sql, auth }) {
  if (!allow(req, res, 'POST')) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { value, fields } = validateRoleEdit(req.body);
    if (!value) return void res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
    const { id, permissions } = value;

    const role = await sql.query(
      'select r.id::text as id, r.name, r.is_protected from roles r where r.id = $1::bigint and r.is_active',
      [id],
    );
    if (role.length === 0) return void res.status(404).json({ error: 'Role not found.' });
    if (role[0].is_protected) return void res.status(403).json({ error: 'The admin role cannot be changed.' });

    const known = await loadPermissionNames(sql);
    const unknown = permissions.filter((name) => !known.includes(name));
    if (unknown.length) {
      return void res.status(400).json({ error: 'Please correct the highlighted fields.', fields: { permissions: `Unknown permission: ${unknown[0]}.` } });
    }
    const adminOnly = adminOnlyAmong(permissions);
    if (adminOnly.length) {
      const message = `Only the admin can have ${adminOnly[0]}.`;
      return void res.status(403).json({ error: message, fields: { permissions: message } });
    }

    const by = auth.user.id;
    await sql.transaction([
      // permissions the role should have and has switched off: switch them on again
      sql.query(
        `update role_permissions set is_active = true, updated_by = $1::bigint
          where role_id = $2::bigint and not is_active
            and permission_id in (select id from permissions where name = any($3::text[]))`,
        [by, id, permissions],
      ),
      // permissions the role never had: a new row
      sql.query(
        `insert into role_permissions (role_id, permission_id, created_by, updated_by)
         select $2::bigint, p.id, $1::bigint, $1::bigint from permissions p
          where p.name = any($3::text[]) and p.is_active
            and not exists (select 1 from role_permissions rp where rp.role_id = $2::bigint and rp.permission_id = p.id)`,
        [by, id, permissions],
      ),
      // permissions the role has and should not: switch them off (the row stays)
      sql.query(
        `update role_permissions set is_active = false, updated_by = $1::bigint
          where role_id = $2::bigint and is_active
            and permission_id not in (select id from permissions where name = any($3::text[]))`,
        [by, id, permissions],
      ),
    ]);

    const [updated] = await loadRolesWithPermissions(sql, id);
    res.status(200).json(updated);
  } catch (e) {
    console.error('edit role failed:', e?.code ?? e?.name ?? 'error');
    res.status(500).json({ error: 'Could not update the role.' });
  }
}
