import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeRes, fakeSql } from './_fakeSql.js';
import { verifyPassword } from './_password.js';
import { handleCreateUser, handleEditUser } from './_userHandlers.js';

const auth = { sessionId: '11', user: { id: '5' }, permissions: ['can_create_user'] };
const body = {
  email: 'Ana@Example.com',
  firstName: 'Ana',
  lastName: 'Petrovic',
  phone: '',
  roleId: '2',
  password: 'Correct-horse-9battery',
};
const userRow = { id: '9', email: 'ana@example.com', first_name: 'Ana', last_name: 'Petrovic', phone: null, role: 'manager', is_active: true, last_login_at: null };

function db({ role = [{ id: '2' }], taken = [], insert } = {}) {
  return fakeSql([
    ['from roles where id', role],
    ['select 1 as taken from users', taken],
    ['insert into users', insert ?? [{ id: '9' }]],
    ['from users u', [userRow]],
  ]);
}

async function run(requestBody, sql = db(), method = 'POST') {
  const res = fakeRes();
  await handleCreateUser({ method, body: requestBody }, res, { sql, auth });
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

test('create: 201 with the new user; the email is stored lowercase, created_by and updated_by are the admin', async () => {
  const sql = db();
  const res = await run(body, sql);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.email, 'ana@example.com');
  assert.equal(res.body.role, 'manager');
  const [insert] = sql.callsTo('insert into users');
  const [email, hash, first, last, phone, roleId, createdBy] = insert.params;
  assert.deepEqual([email, first, last, phone, roleId, createdBy], ['ana@example.com', 'Ana', 'Petrovic', null, '2', '5']);
  assert.match(hash, /^\$2[aby]\$12\$/);
  assert.equal(await import('./_password.js').then((m) => m.verifyPassword(body.password, hash)), true);
});

test('create: the password and its hash never appear in the response or in the log', async () => {
  const logged = [];
  const original = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  let res;
  try {
    res = await run(body, db({ insert: [] })); // an insert that returns no row: a 500 path that logs
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body) + logged.join(' '), /Correct-horse|\$2[aby]\$/);
  const ok = await run(body);
  assert.doesNotMatch(JSON.stringify(ok.body), /password|\$2[aby]\$|Correct-horse/i);
});

test('create: invalid input is 400 with a message per field, and nothing is written', async () => {
  const sql = db();
  const res = await run({ ...body, email: 'nope', password: 'short' }, sql);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(Object.keys(res.body.fields).sort(), ['email', 'password']);
  assert.equal(sql.callsTo('insert into users').length, 0);
  assert.equal(sql.calls.length, 0, 'validation happens before any query');
});

test('create: an unknown or inactive role is 400 on roleId', async () => {
  const sql = db({ role: [] });
  const res = await run(body, sql);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.fields, { roleId: 'Choose an existing role.' });
  assert.equal(sql.callsTo('insert into users').length, 0);
});

test('create: a taken email is 409 and the password is not even hashed', async () => {
  const sql = db({ taken: [{ taken: 1 }] });
  const res = await run(body, sql);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body.fields, { email: 'This email is already in use.' });
  assert.equal(sql.callsTo('insert into users').length, 0);
});

test('create: two admins adding the same email at once: the unique violation is also a 409', async () => {
  const sql = fakeSql([
    ['from roles where id', [{ id: '2' }]],
    ['select 1 as taken from users', []],
    [
      'insert into users',
      () => {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      },
    ],
  ]);
  const res = await run(body, sql);
  assert.equal(res.statusCode, 409);
});

test('create: a database failure is a generic 500', async () => {
  const failing = { query: async () => { throw new Error('boom postgres://u:secret@h'); } };
  const res = await silently(() => run(body, failing));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not create the user.' });
});

test('create: only POST', async () => {
  const res = await run(body, db(), 'GET');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

// ---- edit ----

// A database with user 9 (role 2) to edit. `batches` records how many queries each transaction carried.
function editDb({ target = [{ id: '9', role_id: '2' }], role = [{ id: '3' }] } = {}) {
  const sql = fakeSql([
    ['as role_id', target],
    ['from roles where id', role],
    ['join roles r on r.id = u.role_id', [userRow]],
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

async function edit(requestBody, sql = editDb(), method = 'POST') {
  const res = fakeRes();
  await handleEditUser({ method, body: requestBody }, res, { sql, auth });
  return res;
}

test('edit: changes only the fields sent, records the admin in updated_by and answers with the user', async () => {
  const sql = editDb();
  const res = await edit({ id: '9', firstName: 'Anka', phone: '+381601234567' }, sql);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, 'ana@example.com');
  const [update] = sql.callsTo('update users set');
  assert.equal(update.text, 'update users set first_name = $1, phone = $2, updated_by = $3::bigint where id = $4::bigint');
  assert.deepEqual(update.params, ['Anka', '+381601234567', '5', '9']);
  assert.doesNotMatch(update.text, /password_hash|is_active|role_id|email/);
  assert.equal(sql.callsTo('update sessions').length, 0, 'a name change does not end the sessions');
});

test('edit: an empty phone clears it, and a new role is checked and set as a bigint', async () => {
  const sql = editDb();
  const res = await edit({ id: '9', phone: '', roleId: '3' }, sql);
  assert.equal(res.statusCode, 200);
  const [update] = sql.callsTo('update users set');
  assert.equal(update.text, 'update users set phone = $1, role_id = $2::bigint, updated_by = $3::bigint where id = $4::bigint');
  assert.deepEqual(update.params, [null, '3', '5', '9']);
});

test('edit: a new password is hashed, never returned, and ends all sessions of that user in the SAME transaction', async () => {
  const sql = editDb();
  const res = await edit({ id: '9', password: 'New-password-77!' }, sql);
  assert.equal(res.statusCode, 200);
  const [update] = sql.callsTo('update users set');
  assert.match(update.text, /password_hash = \$1/);
  assert.match(update.params[0], /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword('New-password-77!', update.params[0]), true);
  assert.doesNotMatch(JSON.stringify(res.body), /password|\$2[aby]\$|New-password/i);
  const [revoke] = sql.callsTo('update sessions set is_active = false');
  assert.deepEqual(revoke.params, ['9', '5']);
  assert.deepEqual(sql.batches, [2], 'the update and the revocation are one transaction');
});

test('edit: deactivating ends the sessions; activating again, or any other change, does not', async () => {
  const off = editDb();
  assert.equal((await edit({ id: '9', isActive: false }, off)).statusCode, 200);
  assert.equal(off.callsTo('update sessions set is_active = false').length, 1);
  assert.deepEqual(off.batches, [2]);

  const on = editDb();
  assert.equal((await edit({ id: '9', isActive: true }, on)).statusCode, 200);
  assert.equal(on.callsTo('update sessions').length, 0);
  assert.deepEqual(on.batches, [1]);
});

test('edit: the admin cannot deactivate their own account: 403 and nothing is written', async () => {
  const sql = editDb({ target: [{ id: '5', role_id: '1' }] });
  const res = await edit({ id: '5', isActive: false }, sql);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.fields.isActive, 'You cannot deactivate your own account.');
  assert.equal(sql.callsTo('update').length, 0);
});

test('edit: the admin cannot change their own role: 403 and nothing is written; the same role is fine', async () => {
  const sql = editDb({ target: [{ id: '5', role_id: '1' }] });
  const res = await edit({ id: '5', roleId: '2' }, sql);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.fields.roleId, 'You cannot change your own role.');
  assert.equal(sql.callsTo('update').length, 0);

  const same = editDb({ target: [{ id: '5', role_id: '1' }], role: [{ id: '1' }] });
  assert.equal((await edit({ id: '5', roleId: '1', firstName: 'Ana' }, same)).statusCode, 200);
});

test('edit: the admin can change their own name and password, and can deactivate or re-role ANOTHER admin', async () => {
  assert.equal((await edit({ id: '5', firstName: 'Ana' }, editDb({ target: [{ id: '5', role_id: '1' }] }))).statusCode, 200);
  assert.equal((await edit({ id: '5', password: 'New-password-77!' }, editDb({ target: [{ id: '5', role_id: '1' }] }))).statusCode, 200);
  assert.equal((await edit({ id: '9', isActive: false, roleId: '3' }, editDb({ target: [{ id: '9', role_id: '1' }] }))).statusCode, 200);
});

test('edit: unknown user is 404, unknown role is 400, bad input is 400, an empty change is 400; none of them write', async () => {
  const missing = editDb({ target: [] });
  assert.equal((await edit({ id: '99', firstName: 'Ana' }, missing)).statusCode, 404);
  assert.equal(missing.callsTo('update').length, 0);

  const noRole = editDb({ role: [] });
  const r = await edit({ id: '9', roleId: '77' }, noRole);
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.body.fields, { roleId: 'Choose an existing role.' });
  assert.equal(noRole.callsTo('update').length, 0);

  const bad = editDb();
  const b = await edit({ id: '9', email: 'x@y.co', password: 'short' }, bad);
  assert.equal(b.statusCode, 400);
  assert.deepEqual(Object.keys(b.body.fields).sort(), ['email', 'password']);
  assert.equal(bad.calls.length, 0, 'validation happens before any query');

  const nothing = await edit({ id: '9' });
  assert.equal(nothing.statusCode, 400);
  assert.deepEqual(nothing.body, { error: 'Nothing to change.' });
});

test('edit: a database failure is a generic 500 that never carries the password; only POST', async () => {
  const failing = { query: async () => { throw new Error('boom Password-1234! postgres://u:secret@h'); } };
  const res = await silently(() => edit({ id: '9', password: 'Password-1234!' }, failing));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not update the user.' });
  const get = await edit({ id: '9', firstName: 'Ana' }, editDb(), 'GET');
  assert.equal(get.statusCode, 405);
});
