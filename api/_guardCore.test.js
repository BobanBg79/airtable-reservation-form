import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeRes, fakeSql } from './_fakeSql.js';
import { makeGuards } from './_guardCore.js';
import { generateToken, hashToken } from './_sessions.js';

const row = (permissions) => ({
  session_id: '11',
  expires_at: new Date('2026-12-08T10:00:00Z'),
  user_id: '5',
  email: 'a@b.co',
  first_name: 'Ana',
  last_name: 'P',
  role: 'manager',
  permissions,
});

// A guard over a fake database that knows one session (or none).
function setup(permissions) {
  const sql = fakeSql([['update sessions', permissions ? [row(permissions)] : []]]);
  const guards = makeGuards(() => sql);
  const ok = (req, res, ctx) => {
    ok.ctx = ctx;
    res.status(200).json({ ok: true });
  };
  return { sql, ...guards, ok };
}
const req = () => ({ method: 'GET', headers: { authorization: `Bearer ${generateToken().token}` } });

test('protect: a session with the permission reaches the handler, with { sql, auth }', async () => {
  const { protect, ok, sql } = setup(['can_view_user']);
  const res = fakeRes();
  await protect('can_view_user', ok)(req(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(ok.ctx.sql, sql);
  assert.equal(ok.ctx.auth.user.id, '5');
  assert.deepEqual(ok.ctx.auth.permissions, ['can_view_user']);
});

test('protect: signed in WITHOUT the permission is 403 and the handler never runs', async () => {
  const { protect, ok } = setup(['can_view_apartment']);
  const res = fakeRes();
  await protect('can_view_user', ok)(req(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(ok.ctx, undefined);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('protect and authenticated: no token, or a session that does not resolve, is 401', async () => {
  for (const wrap of ['protect', 'authenticated']) {
    const { sql, ok, ...g } = setup(null); // the statement finds nothing: unknown, expired, inactive session or user
    const handler = wrap === 'protect' ? g.protect('can_view_user', ok) : g.authenticated(ok);

    const noToken = fakeRes();
    await handler({ method: 'GET', headers: {} }, noToken);
    assert.equal(noToken.statusCode, 401);

    const unknown = fakeRes();
    await handler(req(), unknown);
    assert.equal(unknown.statusCode, 401);
    assert.equal(ok.ctx, undefined);
  }
});

test('authenticated: any signed-in user passes, even with no permissions at all', async () => {
  const { authenticated, ok } = setup([]);
  const res = fakeRes();
  await authenticated(ok)(req(), res);
  assert.equal(res.statusCode, 200);
});

test('publicRoute: no session needed, and the database is never asked about one', async () => {
  const { publicRoute, ok, sql } = setup(null);
  const res = fakeRes();
  await publicRoute(ok)({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sql.calls.length, 0);
});

test('the token is looked up by its hash, in one statement per request', async () => {
  const { protect, ok, sql } = setup(['can_view_user']);
  const r = req();
  await protect('can_view_user', ok)(r, fakeRes());
  assert.equal(sql.calls.length, 1);
  assert.equal(sql.calls[0].params[0], hashToken(r.headers.authorization.slice(7)));
});

test('a database failure while checking the session is a generic 500, never a pass', async () => {
  const sql = { query: async () => { throw new Error('connection to postgres://u:secret@h failed'); } };
  const { protect } = makeGuards(() => sql);
  const handler = protect('can_view_user', () => assert.fail('must not run'));
  const res = fakeRes();
  const original = console.error;
  console.error = () => {};
  try {
    await handler(req(), res);
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /secret|postgres/);
});

test('each guard marks the handler so the route can be audited', () => {
  const { protect, authenticated, publicRoute, ok } = setup([]);
  assert.deepEqual(protect('can_view_user', ok).guard, { kind: 'protect', permission: 'can_view_user' });
  assert.deepEqual(authenticated(ok).guard, { kind: 'authenticated', permission: null });
  assert.deepEqual(publicRoute(ok).guard, { kind: 'public', permission: null });
});

test('protect refuses a missing or malformed permission name when the route is defined', () => {
  const { protect, ok } = setup([]);
  assert.throws(() => protect(undefined, ok), /permission name/);
  assert.throws(() => protect('view_user', ok), /permission name/);
  assert.throws(() => protect('can_delete_user', ok), /permission name/); // there is no delete action
});
