import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeSql } from './_fakeSql.js';
import {
  MAX_DAYS,
  SLIDING_DAYS,
  bearerToken,
  createSessionQuery,
  generateToken,
  hashToken,
  resolveSession,
  revokeSession,
  revokeUserSessions,
  sessionPayload,
} from './_sessions.js';

test('the sliding window is 7 days and the hard cap 90 days', () => {
  assert.equal(SLIDING_DAYS, 7);
  assert.equal(MAX_DAYS, 90);
});

test('generateToken makes a random 32-byte token and stores only its SHA-256 hash', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a.token, b.token);
  assert.equal(Buffer.from(a.token, 'base64url').length, 32);
  // SHA-256 of "abc" is a published test vector (FIPS 180-2), so no second implementation is needed here
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(a.tokenHash, a.token);
  assert.equal(hashToken(a.token), a.tokenHash);
});

test('bearerToken reads only a well-formed Authorization: Bearer header', () => {
  const { token } = generateToken();
  assert.equal(bearerToken({ headers: { authorization: `Bearer ${token}` } }), token);
  assert.equal(bearerToken({ headers: { authorization: token } }), null);
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), null);
  assert.equal(bearerToken({ headers: { authorization: 'Bearer short' } }), null);
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken({}), null);
});

test('createSessionQuery stores the hash, never the token, with 7 and 90 day limits', async () => {
  const sql = fakeSql();
  const { token, tokenHash } = generateToken();
  await createSessionQuery(sql, '5', tokenHash);
  const { text, params } = sql.calls[0];
  assert.match(text, /insert into sessions/);
  assert.deepEqual(params, ['5', tokenHash, 7, 90]);
  assert.ok(!params.includes(token), 'the token itself is never sent to the database');
  assert.match(text, /created_by, updated_by\)\s+values \(\$1::bigint/); // the session's own user
});

const row = {
  session_id: '11',
  expires_at: new Date('2026-12-08T10:00:00Z'),
  user_id: '5',
  email: 'owner@example.com',
  first_name: 'Ana',
  last_name: 'Petrovic',
  role: 'admin',
  permissions: ['can_view_user', 'can_view_apartment'],
};

test('resolveSession returns the session, user and permissions, and looks the token up by its hash', async () => {
  const sql = fakeSql([['update sessions', [row]]]);
  const { token } = generateToken();
  const session = await resolveSession(sql, token);

  assert.deepEqual(session, {
    sessionId: '11',
    expiresAt: '2026-12-08T10:00:00.000Z',
    user: { id: '5', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic', role: 'admin' },
    permissions: ['can_view_user', 'can_view_apartment'],
  });
  assert.deepEqual(sql.calls[0].params, [hashToken(token), 7]);
  assert.ok(!JSON.stringify(sql.calls[0].params).includes(token));
});

test('resolveSession does everything in ONE statement: check, slide (capped at max_expires_at), user, role, permissions', async () => {
  const sql = fakeSql([['update sessions', [row]]]);
  await resolveSession(sql, generateToken().token);
  assert.equal(sql.calls.length, 1);
  const text = sql.calls[0].text;
  assert.match(text, /least\(now\(\) \+ make_interval\(days => \$2::int\), s\.max_expires_at\)/); // never past login + 90 days
  assert.match(text, /s\.is_active/);
  assert.match(text, /s\.expires_at > now\(\)/); // expired sessions are refused
  assert.match(text, /u\.is_active/);
  assert.match(text, /r\.is_active/);
  assert.match(text, /rp\.is_active and p\.is_active/); // only active permissions
  assert.doesNotMatch(text, /password/i);
});

test('resolveSession returns null when the statement finds nothing (unknown, expired, inactive)', async () => {
  const sql = fakeSql([['update sessions', []]]);
  assert.equal(await resolveSession(sql, generateToken().token), null);
});

test('resolveSession does not even query for a missing token', async () => {
  const sql = fakeSql();
  assert.equal(await resolveSession(sql, null), null);
  assert.equal(await resolveSession(sql, ''), null);
  assert.equal(sql.calls.length, 0);
});

test('revokeSession sets is_active = false and records who did it; it never deletes', async () => {
  const sql = fakeSql();
  await revokeSession(sql, '11', '5');
  const { text, params } = sql.calls[0];
  assert.match(text, /update sessions set is_active = false, updated_by = \$2::bigint/);
  assert.doesNotMatch(text, /delete/i);
  assert.deepEqual(params, ['11', '5']);
});

test('revokeUserSessions ends all active sessions of one user, records who did it, and never deletes', async () => {
  const sql = fakeSql();
  await revokeUserSessions(sql, '7', '5');
  const { text, params } = sql.calls[0];
  assert.match(text, /update sessions set is_active = false, updated_by = \$2::bigint where user_id = \$1::bigint and is_active/);
  assert.doesNotMatch(text, /delete/i);
  assert.deepEqual(params, ['7', '5']);
});

test('sessionPayload leaves out the session id', () => {
  const payload = sessionPayload({ sessionId: '11', expiresAt: 'x', user: { id: '5' }, permissions: [] });
  assert.deepEqual(Object.keys(payload).sort(), ['expiresAt', 'permissions', 'user']);
});
