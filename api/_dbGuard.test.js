import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDevDatabaseSafe, checkDevDatabaseEnv, roleOf } from './_dbGuard.js';

const url = (role) => `postgresql://${role}:s3cret-pass@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require`;
const good = {
  DATABASE_URL: url('delta_app'),
  DATABASE_URL_UNPOOLED: url('delta_app'),
  NEON_BRANCH: 'dev',
};

test('roleOf reads the user and never the password', () => {
  assert.equal(roleOf(url('delta_app')), 'delta_app');
  assert.equal(roleOf('postgres://neondb_owner:pw@host/db'), 'neondb_owner');
  assert.equal(roleOf('not a url'), undefined);
  assert.equal(roleOf(undefined), undefined);
});

test('passes for delta_app on the dev branch', () => {
  assert.deepEqual(checkDevDatabaseEnv(good), { ok: true, skipped: false, problems: [] });
});

test('fails when the app connects as the owner', () => {
  const r = checkDevDatabaseEnv({ ...good, DATABASE_URL: url('neondb_owner') });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /DATABASE_URL connects as "neondb_owner"/);
});

test('fails when the unpooled url uses another role', () => {
  const r = checkDevDatabaseEnv({ ...good, DATABASE_URL_UNPOOLED: url('delta_readonly') });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /DATABASE_URL_UNPOOLED/);
});

test('fails when the branch is not dev, or unset', () => {
  assert.equal(checkDevDatabaseEnv({ ...good, NEON_BRANCH: 'production' }).ok, false);
  assert.equal(checkDevDatabaseEnv({ ...good, NEON_BRANCH: undefined }).ok, false);
});

test('fails when DATABASE_URL is missing', () => {
  assert.equal(checkDevDatabaseEnv({ NEON_BRANCH: 'dev' }).ok, false);
});

test('is skipped on Vercel production and preview (they use their own variables)', () => {
  assert.equal(checkDevDatabaseEnv({ VERCEL_ENV: 'production' }).skipped, true);
  assert.equal(checkDevDatabaseEnv({ VERCEL_ENV: 'preview' }).skipped, true);
  assert.equal(checkDevDatabaseEnv({ NODE_ENV: 'production' }).skipped, true);
});

test('runs under `vercel dev`', () => {
  assert.equal(checkDevDatabaseEnv({ ...good, VERCEL_ENV: 'development' }).skipped, false);
});

test('assert refuses to start loudly and leaks no secrets', () => {
  const logged = [];
  const env = { ...good, DATABASE_URL: url('neondb_owner'), NEON_BRANCH: 'production' };
  assert.throws(() => assertDevDatabaseSafe(env, (m) => logged.push(m)), /Refusing to start/);
  const out = logged.join('\n');
  assert.match(out, /REFUSING TO START/);
  assert.doesNotMatch(out, /s3cret-pass|ep-test|postgres(ql)?:\/\//);
});

test('assert returns the result when safe', () => {
  assert.equal(assertDevDatabaseSafe(good, () => {}).ok, true);
});
