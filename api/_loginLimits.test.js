import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeSql } from './_fakeSql.js';
import {
  MAX_FAILURES_PER_EMAIL_AND_IP,
  MAX_FAILURES_PER_IP,
  WINDOW_MINUTES,
  getClientIp,
  isLimited,
  recordAttemptQuery,
} from './_loginLimits.js';

test('the limits are 5 per email + IP and 30 per IP in 15 minutes', () => {
  assert.equal(MAX_FAILURES_PER_EMAIL_AND_IP, 5);
  assert.equal(MAX_FAILURES_PER_IP, 30);
  assert.equal(WINDOW_MINUTES, 15);
});

const limited = (pair, ip) => isLimited(fakeSql([['from login_attempts', [{ pair_failures: pair, ip_failures: ip }]]]), { email: 'a@b.co', ip: '1.2.3.4' });

test('isLimited: 4 failures for the pair is fine, 5 is limited', async () => {
  assert.equal(await limited(4, 4), false);
  assert.equal(await limited(5, 5), true);
});

test('isLimited: 29 failures from the IP is fine, 30 is limited, whatever the emails', async () => {
  assert.equal(await limited(0, 29), false);
  assert.equal(await limited(0, 30), true);
});

test('isLimited counts only failures in the window, by parameters, and is false with no rows', async () => {
  const sql = fakeSql([['from login_attempts', []]]);
  assert.equal(await isLimited(sql, { email: 'a@b.co', ip: '1.2.3.4' }), false);
  const { text, params } = sql.calls[0];
  assert.match(text, /not succeeded/);
  assert.match(text, /created_at > now\(\) - make_interval\(mins => \$3::int\)/);
  assert.deepEqual(params, ['a@b.co', '1.2.3.4', 15]);
});

test('there is no lockout by email alone: the query always filters by IP', async () => {
  const sql = fakeSql([['from login_attempts', []]]);
  await isLimited(sql, { email: 'admin@example.com', ip: '9.9.9.9' });
  assert.match(sql.calls[0].text, /where ip = \$2/);
});

test('recordAttemptQuery inserts into login_attempts only (insert only table)', async () => {
  const sql = fakeSql();
  await recordAttemptQuery(sql, { email: 'a@b.co', ip: '1.2.3.4', userId: null, succeeded: false });
  assert.match(sql.calls[0].text, /^insert into login_attempts/);
  assert.deepEqual(sql.calls[0].params, ['a@b.co', '1.2.3.4', null, false]);
});

test('getClientIp takes the first x-forwarded-for value, else the socket address', () => {
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } }), '203.0.113.7');
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': ['198.51.100.2'] } }), '198.51.100.2');
  assert.equal(getClientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
  assert.equal(getClientIp({ headers: {} }), 'unknown');
});
