// Checks the real SQL of api/_sessions.js on the Neon DEV branch: sliding expiry, the 90 day cap, expired and
// inactive sessions, revocation. A fake SQL client cannot prove these, but this test WRITES to the database
// (sessions can never be deleted, so each run leaves a few inactive session rows of the first admin). That is
// why it is opt-in:
//
//   RUN_SESSION_DB_TESTS=1 npm run test:scripts
//
// Runs as delta_app (INSERT and UPDATE on sessions). Sessions it creates are deactivated at the end.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { neon } from '@neondatabase/serverless';
import { PERMISSIONS } from '../packages/core/src/models/permissions.ts';
import { generateToken, resolveSession, revokeSession } from '../api/_sessions.js';
import { loadEnvLocal } from './load-env-local.mjs';

const env = loadEnvLocal();
const enabled = process.env.RUN_SESSION_DB_TESTS === '1' && !!env?.DATABASE_URL;
const opts = { skip: enabled ? false : 'opt-in: set RUN_SESSION_DB_TESTS=1 (writes inactive session rows to the dev database)' };
const sql = enabled ? neon(env.DATABASE_URL) : null;
const created = [];

/** Inserts a session for `userId` with the given offsets from now (in seconds) and returns its token. */
async function insertSession(userId, { expiresIn, maxIn, active = true }) {
  const { token, tokenHash } = generateToken();
  const rows = await sql.query(
    `insert into sessions (user_id, token_hash, expires_at, max_expires_at, is_active, created_by, updated_by)
     values ($1::bigint, $2, now() + make_interval(secs => $3), now() + make_interval(secs => $4), $5, $1::bigint, $1::bigint)
     returning id::text as id`,
    [userId, tokenHash, expiresIn, maxIn, active],
  );
  created.push(rows[0].id);
  return { token, id: rows[0].id };
}

const DAY = 86_400;
const stored = async (id) => (await sql.query('select expires_at, max_expires_at, last_used_at, is_active from sessions where id = $1::bigint', [id]))[0];

let adminId;
async function admin() {
  if (!adminId) {
    const rows = await sql.query(`select u.id::text as id from users u join roles r on r.id = u.role_id where r.name = 'admin' and u.is_active order by u.id limit 1`);
    assert.ok(rows.length, 'run npm run db:create-admin first');
    adminId = rows[0].id;
  }
  return adminId;
}

after(async () => {
  if (created.length) await sql.query('update sessions set is_active = false where id = any($1::bigint[])', [created]);
});

test('a valid session is returned with the user and all 19 admin permissions, and the expiry slides to ~7 days', opts, async () => {
  const { token, id } = await insertSession(await admin(), { expiresIn: DAY, maxIn: 90 * DAY });
  const session = await resolveSession(sql, token);

  assert.ok(session);
  assert.equal(session.user.role, 'admin');
  assert.deepEqual([...session.permissions].sort(), [...PERMISSIONS].sort());

  const row = await stored(id);
  const days = (new Date(row.expires_at) - Date.now()) / 1000 / DAY;
  assert.ok(days > 6.99 && days < 7.01, `expires in ${days} days`);
  assert.ok(row.last_used_at, 'last_used_at is set');
});

test('the expiry never passes max_expires_at (login + 90 days)', opts, async () => {
  const { token, id } = await insertSession(await admin(), { expiresIn: DAY, maxIn: 10 * DAY });
  assert.ok(await resolveSession(sql, token));
  const row = await stored(id);
  assert.equal(new Date(row.expires_at).getTime(), new Date(row.max_expires_at).getTime(), 'capped at the maximum');
});

test('an expired session is refused and is NOT slid', opts, async () => {
  const { token, id } = await insertSession(await admin(), { expiresIn: -3600, maxIn: 80 * DAY });
  const before = await stored(id);
  assert.equal(await resolveSession(sql, token), null);
  const after = await stored(id);
  assert.equal(new Date(after.expires_at).getTime(), new Date(before.expires_at).getTime());
});

test('an inactive session is refused', opts, async () => {
  const { token } = await insertSession(await admin(), { expiresIn: DAY, maxIn: 90 * DAY, active: false });
  assert.equal(await resolveSession(sql, token), null);
});

test('an unknown token is refused', opts, async () => {
  assert.equal(await resolveSession(sql, generateToken().token), null);
});

test('after revokeSession the token stops working, and the row stays (nothing is deleted)', opts, async () => {
  const userId = await admin();
  const { token, id } = await insertSession(userId, { expiresIn: DAY, maxIn: 90 * DAY });
  const session = await resolveSession(sql, token);
  assert.ok(session);
  await revokeSession(sql, session.sessionId, userId);
  assert.equal(await resolveSession(sql, token), null);
  assert.equal((await stored(id)).is_active, false);
});
