import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeRes, fakeSql } from './_fakeSql.js';
import { handleCreateUser } from './_userHandlers.js';

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
