// The logic of the user write routes, after the guard has let the caller in (the route files in api/users/ are
// thin: `export default protect('can_...', handleX)`). The SQL client and the caller (`auth`) are passed in, so
// the handlers can be tested without a database. A password is hashed here, is never logged and never comes
// back in a response.
import { hashPassword } from './_password.js';
import { loadUser } from './_pgReads.js';
import { revokeUserSessionsQuery } from './_sessions.js';
import { validateNewUser, validateUserEdit } from './_userInput.js';

const UNIQUE_VIOLATION = '23505';

function allow(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  res.status(405).json({ error: 'Method not allowed.' });
  return false;
}

function emailTaken(res) {
  return res.status(409).json({
    error: 'A user with this email already exists.',
    fields: { email: 'This email is already in use.' },
  });
}

/**
 * POST /api/users/create (can_create_user). Body: email, firstName, lastName, phone (optional), roleId, password.
 * 201 with the new user (never a hash), 400 with `fields` when something is invalid, 409 when the email is taken.
 */
export async function handleCreateUser(req, res, { sql, auth }) {
  if (!allow(req, res, 'POST')) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { value, fields } = validateNewUser(req.body);
    if (!value) return void res.status(400).json({ error: 'Please correct the highlighted fields.', fields });

    const role = await sql.query('select id::text as id from roles where id = $1::bigint and is_active', [value.roleId]);
    if (role.length === 0) {
      return void res.status(400).json({ error: 'Please correct the highlighted fields.', fields: { roleId: 'Choose an existing role.' } });
    }
    const existing = await sql.query('select 1 as taken from users where email = $1', [value.email]);
    if (existing.length > 0) return void emailTaken(res);

    const passwordHash = await hashPassword(value.password);
    let created;
    try {
      created = await sql.query(
        `insert into users (email, password_hash, first_name, last_name, phone, role_id, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6::bigint, $7::bigint, $7::bigint)
         returning id::text as id`,
        [value.email, passwordHash, value.firstName, value.lastName, value.phone, value.roleId, auth.user.id],
      );
    } catch (e) {
      if (e?.code === UNIQUE_VIOLATION) return void emailTaken(res); // two admins created the same email at once
      throw e;
    }
    res.status(201).json(await loadUser(sql, created[0].id));
  } catch (e) {
    console.error('create user failed:', e?.code ?? e?.name ?? 'error'); // never the message: it could carry input
    res.status(500).json({ error: 'Could not create the user.' });
  }
}

// The columns an edit can change, by the name in the request.
const EDIT_COLUMNS = { firstName: 'first_name', lastName: 'last_name', phone: 'phone', roleId: 'role_id', isActive: 'is_active' };

/**
 * POST /api/users/edit (can_edit_user). Body: id, plus any of firstName, lastName, phone, roleId, isActive and
 * password (the new one; the forgotten-password flow). Only the fields present are changed; the email never is.
 * The admin cannot deactivate their own account or change their own role (403), so there is always an active
 * admin. A new password or a deactivation also ends all of the user's sessions, in the same transaction.
 * 200 with the updated user (never a hash), 400 with `fields`, 403, 404.
 */
export async function handleEditUser(req, res, { sql, auth }) {
  if (!allow(req, res, 'POST')) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { value, fields } = validateUserEdit(req.body);
    if (!value) return void res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
    const { id, changes } = value;
    if (Object.keys(changes).length === 0) return void res.status(400).json({ error: 'Nothing to change.' });

    const target = await sql.query(
      `select u.id::text as id, u.role_id::text as role_id from users u
        where u.id = $1::bigint and u.email not like '%@system.local'`,
      [id],
    );
    if (target.length === 0) return void res.status(404).json({ error: 'User not found.' });

    if (id === auth.user.id) {
      if (changes.isActive === false) {
        return void res.status(403).json({ error: 'You cannot deactivate your own account.', fields: { isActive: 'You cannot deactivate your own account.' } });
      }
      if (changes.roleId !== undefined && changes.roleId !== target[0].role_id) {
        return void res.status(403).json({ error: 'You cannot change your own role.', fields: { roleId: 'You cannot change your own role.' } });
      }
    }

    if (changes.roleId !== undefined) {
      const role = await sql.query('select id::text as id from roles where id = $1::bigint and is_active', [changes.roleId]);
      if (role.length === 0) {
        return void res.status(400).json({ error: 'Please correct the highlighted fields.', fields: { roleId: 'Choose an existing role.' } });
      }
    }

    const sets = [];
    const params = [];
    for (const [name, column] of Object.entries(EDIT_COLUMNS)) {
      if (changes[name] === undefined) continue;
      params.push(changes[name]);
      sets.push(`${column} = $${params.length}${name === 'roleId' ? '::bigint' : ''}`);
    }
    if (changes.password !== undefined) {
      params.push(await hashPassword(changes.password));
      sets.push(`password_hash = $${params.length}`);
    }
    params.push(auth.user.id);
    sets.push(`updated_by = $${params.length}::bigint`);
    params.push(id);
    const update = sql.query(`update users set ${sets.join(', ')} where id = $${params.length}::bigint`, params);

    const queries = [update];
    if (changes.isActive === false || changes.password !== undefined) queries.push(revokeUserSessionsQuery(sql, id, auth.user.id));
    await sql.transaction(queries);

    res.status(200).json(await loadUser(sql, id));
  } catch (e) {
    console.error('edit user failed:', e?.code ?? e?.name ?? 'error'); // never the message: it could carry input
    res.status(500).json({ error: 'Could not update the user.' });
  }
}
