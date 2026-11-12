import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeRes, fakeSql } from './_fakeSql.js';
import { handleEditRole, handleRolePermissions } from './_roleHandlers.js';

const auth = { sessionId: '11', user: { id: '5' }, permissions: ['can_view_role', 'can_edit_role'] };
const ALL = ['can_view_apartment', 'can_edit_apartment', 'can_view_reservation', 'can_view_user', 'can_edit_role'];
const manager = { id: '3', name: 'manager', is_protected: false, permissions: ['can_view_apartment'] };
const admin = { id: '1', name: 'admin', is_protected: true, permissions: ALL };

// A database where role 3 (manager) can be edited and role 1 (admin) is protected. `batches` records how many
// queries each transaction carried.
function db({ role = [{ id: '3', name: 'manager', is_protected: false }], names = ALL } = {}) {
  const sql = fakeSql([
    ['r.is_protected from roles r where', role],
    ['from permissions where is_active', names.map((name) => ({ name }))],
    ['group by r.id', [manager]],
  ]);
  const batches = [];
  const original = sql.transaction;
  sql.transaction = async (queries) => {
    batches.push(queries.length);
    return original(queries);
  };
  sql.batches = batches;
  return sql;
}

async function edit(body, sql = db(), method = 'POST') {
  const res = fakeRes();
  await handleEditRole({ method, body }, res, { sql, auth });
  return res;
}

async function silently(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// ---- GET /api/roles/permissions ----

test('role permissions: every permission name and each role with its names, no-store', async () => {
  const sql = fakeSql([
    ['from permissions where is_active', ALL.map((name) => ({ name }))],
    ['group by r.id', [admin, manager]],
  ]);
  const res = fakeRes();
  await handleRolePermissions({ method: 'GET' }, res, { sql });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    permissions: ALL,
    roles: [
      { id: '1', name: 'admin', isProtected: true, permissions: ALL },
      { id: '3', name: 'manager', isProtected: false, permissions: ['can_view_apartment'] },
    ],
  });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('role permissions: only GET, and a database failure is a generic 500', async () => {
  const wrong = fakeRes();
  await handleRolePermissions({ method: 'POST' }, wrong, { sql: fakeSql() });
  assert.equal(wrong.statusCode, 405);
  assert.equal(wrong.headers.Allow, 'GET');
  const failing = { query: async () => { throw new Error('boom postgres://u:secret@h'); } };
  const res = fakeRes();
  await silently(() => handleRolePermissions({ method: 'GET' }, res, { sql: failing }));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not load roles.' });
});

// ---- POST /api/roles/edit ----

test('edit: sets the permissions in one transaction of three statements and answers with the role', async () => {
  const sql = db();
  const res = await edit({ id: '3', permissions: ['can_view_apartment', 'can_edit_apartment'] }, sql);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { id: '3', name: 'manager', isProtected: false, permissions: ['can_view_apartment'] });
  assert.deepEqual(sql.batches, [3]);
  const writes = sql.calls.filter((c) => /^\s*(update|insert)/.test(c.text));
  assert.equal(writes.length, 3);
  for (const w of writes) assert.deepEqual(w.params, ['5', '3', ['can_view_apartment', 'can_edit_apartment']]);
});

test('edit: switches rows on and off and adds new ones; it never deletes and never touches the permissions table', async () => {
  const sql = db();
  await edit({ id: '3', permissions: ['can_view_apartment'] }, sql);
  const [on, add, off] = sql.calls.filter((c) => /^\s*(update|insert)/.test(c.text)).map((c) => c.text.replace(/\s+/g, ' '));
  assert.match(on, /^update role_permissions set is_active = true, updated_by = \$1::bigint where role_id = \$2::bigint and not is_active/);
  assert.match(add, /^insert into role_permissions \(role_id, permission_id, created_by, updated_by\) select \$2::bigint, p\.id, \$1::bigint, \$1::bigint from permissions p/);
  assert.match(add, /not exists \(select 1 from role_permissions rp where rp\.role_id = \$2::bigint and rp\.permission_id = p\.id\)/);
  assert.match(off, /^update role_permissions set is_active = false, updated_by = \$1::bigint where role_id = \$2::bigint and is_active and permission_id not in/);
  assert.ok(sql.calls.every((c) => !/\bdelete\b/i.test(c.text)));
  assert.ok(sql.calls.every((c) => !/^\s*(update|insert into) permissions\b/i.test(c.text)));
});

test('edit: an empty list switches every permission of the role off', async () => {
  const sql = db();
  assert.equal((await edit({ id: '3', permissions: [] }, sql)).statusCode, 200);
  assert.deepEqual(sql.batches, [3]);
});

test('edit: the admin role cannot be changed: 403 and nothing is written', async () => {
  const sql = db({ role: [{ id: '1', name: 'admin', is_protected: true }] });
  const res = await edit({ id: '1', permissions: ALL }, sql);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'The admin role cannot be changed.' });
  assert.deepEqual(sql.batches, []);
});

test('edit: the user and role permissions can never be given to another role: 403 and nothing is written', async () => {
  for (const name of ['can_view_user', 'can_create_user', 'can_edit_user', 'can_view_role', 'can_edit_role']) {
    const sql = db({ names: [...ALL, 'can_create_user', 'can_edit_user', 'can_view_role'] });
    const res = await edit({ id: '3', permissions: ['can_view_apartment', name] }, sql);
    assert.equal(res.statusCode, 403, name);
    assert.equal(res.body.fields.permissions, `Only the admin can have ${name}.`);
    assert.deepEqual(sql.batches, [], name);
  }
});

test('edit: an unknown role is 404, an unknown permission is 400, bad input is 400; none of them write', async () => {
  const noRole = db({ role: [] });
  assert.equal((await edit({ id: '99', permissions: [] }, noRole)).statusCode, 404);
  assert.deepEqual(noRole.batches, []);

  const unknown = db();
  const u = await edit({ id: '3', permissions: ['can_view_apartment', 'can_view_spaceship'] }, unknown);
  assert.equal(u.statusCode, 400);
  assert.deepEqual(u.body.fields, { permissions: 'Unknown permission: can_view_spaceship.' });
  assert.deepEqual(unknown.batches, []);

  const bad = db();
  const b = await edit({ id: 'x', permissions: 'nope' }, bad);
  assert.equal(b.statusCode, 400);
  assert.deepEqual(Object.keys(b.body.fields).sort(), ['id', 'permissions']);
  assert.equal(bad.calls.length, 0, 'validation happens before any query');
});

test('edit: only POST, and a database failure is a generic 500', async () => {
  const get = await edit({ id: '3', permissions: [] }, db(), 'GET');
  assert.equal(get.statusCode, 405);
  const failing = { query: async () => { throw new Error('boom postgres://u:secret@h'); } };
  const res = await silently(() => edit({ id: '3', permissions: [] }, failing));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not update the role.' });
});
