import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalScriptAllowed, checkLocalScriptAllowed } from './local-guard.mjs';

const url = (role) => `postgresql://${role}:s3cret-pass@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require`;
const goodFile = { DATABASE_URL: url('delta_app'), NEON_BRANCH: 'dev' };
const cleanProcess = {};

test('allows delta_app on dev from a clean shell', () => {
  assert.deepEqual(checkLocalScriptAllowed(goodFile, cleanProcess), { ok: true, problems: [] });
});

test('refuses on Vercel, in CI and in production', () => {
  for (const p of [{ VERCEL: '1' }, { VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { CI: 'true' }, { NODE_ENV: 'production' }]) {
    assert.equal(checkLocalScriptAllowed(goodFile, p).ok, false, JSON.stringify(p));
  }
});

test('refuses when a DATABASE_URL is set in the shell (could be production)', () => {
  const r = checkLocalScriptAllowed(goodFile, { DATABASE_URL: url('delta_app') });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /shell environment/);
});

test('refuses the owner role, the read-only role and a missing url', () => {
  assert.equal(checkLocalScriptAllowed({ ...goodFile, DATABASE_URL: url('neondb_owner') }, cleanProcess).ok, false);
  assert.equal(checkLocalScriptAllowed({ ...goodFile, DATABASE_URL: url('delta_readonly') }, cleanProcess).ok, false);
  assert.equal(checkLocalScriptAllowed({ NEON_BRANCH: 'dev' }, cleanProcess).ok, false);
});

test('refuses any branch but dev, or an unset branch', () => {
  assert.equal(checkLocalScriptAllowed({ ...goodFile, NEON_BRANCH: 'production' }, cleanProcess).ok, false);
  assert.equal(checkLocalScriptAllowed({ ...goodFile, NEON_BRANCH: undefined }, cleanProcess).ok, false);
});

test('refuses an .env.local that says production, and still reports the role and branch', () => {
  // The shared check must not switch itself off for a file with VERCEL_ENV=production.
  const file = { DATABASE_URL: url('neondb_owner'), NEON_BRANCH: 'production', VERCEL_ENV: 'production' };
  const r = checkLocalScriptAllowed(file, cleanProcess);
  assert.equal(r.ok, false);
  const text = r.problems.join(' ');
  assert.match(text, /describe Vercel production or preview/);
  assert.match(text, /neondb_owner/);
  assert.match(text, /NEON_BRANCH/);
});

test('assert throws, logs the reasons and leaks no secrets', () => {
  const logged = [];
  const file = { DATABASE_URL: url('neondb_owner'), NEON_BRANCH: 'production' };
  assert.throws(() => assertLocalScriptAllowed(file, { CI: 'true' }, (m) => logged.push(m)), /Refusing to run/);
  const out = logged.join('\n');
  assert.match(out, /REFUSING TO RUN/);
  assert.doesNotMatch(out, /s3cret-pass|ep-test|postgres(ql)?:\/\//);
});
