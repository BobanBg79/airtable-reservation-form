import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_ROLE, DEV_BRANCH, OWNER_ROLE, assertDevDatabaseSafe, checkDevDatabaseEnv, roleOf } from './_dbGuard.js';

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

test('force: never skipped, even when the variables say production', () => {
  // Scripts that read .env.local use force. A pulled production env file must not switch the check off.
  const prod = { VERCEL_ENV: 'production', DATABASE_URL: url('neondb_owner'), NEON_BRANCH: 'production' };
  assert.equal(checkDevDatabaseEnv(prod).skipped, true); // default behaviour on Vercel itself
  const forced = checkDevDatabaseEnv(prod, { force: true });
  assert.equal(forced.ok, false);
  assert.equal(forced.skipped, false);
  const text = forced.problems.join(' ');
  assert.match(text, /describe Vercel production or preview/);
  assert.match(text, /DATABASE_URL connects as "neondb_owner"/);
  assert.match(text, /NEON_BRANCH is "production"/);
});

test('force: a good dev file with a development marker passes', () => {
  assert.equal(checkDevDatabaseEnv({ ...good, VERCEL_ENV: 'development' }, { force: true }).ok, true);
  assert.equal(checkDevDatabaseEnv(good, { force: true }).ok, true);
});

test('force: a good-looking file that says preview is still refused', () => {
  assert.equal(checkDevDatabaseEnv({ ...good, VERCEL_ENV: 'preview' }, { force: true }).ok, false);
  assert.equal(checkDevDatabaseEnv({ ...good, NODE_ENV: 'production' }, { force: true }).ok, false);
});

test('role and branch names are defined here and nowhere else', () => {
  assert.equal(APP_ROLE, 'delta_app');
  assert.equal(OWNER_ROLE, 'neondb_owner');
  assert.equal(DEV_BRANCH, 'dev');
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
