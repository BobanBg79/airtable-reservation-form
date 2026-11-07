import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_APARTMENTS, SEED_MARKER } from './seed-data.mjs';
import { assertSeedAllowed, checkSeedAllowed } from './seed-guard.mjs';

const url = (role) => `postgresql://${role}:s3cret-pass@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require`;
const goodFile = { DATABASE_URL: url('delta_app'), NEON_BRANCH: 'dev' };
const cleanProcess = {};

// ---- guard ----

test('allows delta_app on dev from a clean shell', () => {
  assert.deepEqual(checkSeedAllowed(goodFile, cleanProcess), { ok: true, problems: [] });
});

test('refuses on Vercel, in CI and in production', () => {
  for (const p of [{ VERCEL: '1' }, { VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { CI: 'true' }, { NODE_ENV: 'production' }]) {
    assert.equal(checkSeedAllowed(goodFile, p).ok, false, JSON.stringify(p));
  }
});

test('refuses when a DATABASE_URL is set in the shell (could be production)', () => {
  const r = checkSeedAllowed(goodFile, { DATABASE_URL: url('delta_app') });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /shell environment/);
});

test('refuses the owner role, the read-only role and a missing url', () => {
  assert.equal(checkSeedAllowed({ ...goodFile, DATABASE_URL: url('neondb_owner') }, cleanProcess).ok, false);
  assert.equal(checkSeedAllowed({ ...goodFile, DATABASE_URL: url('delta_readonly') }, cleanProcess).ok, false);
  assert.equal(checkSeedAllowed({ NEON_BRANCH: 'dev' }, cleanProcess).ok, false);
});

test('refuses any branch but dev, or an unset branch', () => {
  assert.equal(checkSeedAllowed({ ...goodFile, NEON_BRANCH: 'production' }, cleanProcess).ok, false);
  assert.equal(checkSeedAllowed({ ...goodFile, NEON_BRANCH: undefined }, cleanProcess).ok, false);
});

test('refuses an .env.local that says production, and still reports the role and branch', () => {
  // The shared check must not switch itself off for a file with VERCEL_ENV=production.
  const file = { DATABASE_URL: url('neondb_owner'), NEON_BRANCH: 'production', VERCEL_ENV: 'production' };
  const r = checkSeedAllowed(file, cleanProcess);
  assert.equal(r.ok, false);
  const text = r.problems.join(' ');
  assert.match(text, /describe Vercel production or preview/);
  assert.match(text, /neondb_owner/);
  assert.match(text, /NEON_BRANCH/);
});

test('assert throws, logs the reasons and leaks no secrets', () => {
  const logged = [];
  const file = { DATABASE_URL: url('neondb_owner'), NEON_BRANCH: 'production' };
  assert.throws(() => assertSeedAllowed(file, { CI: 'true' }, (m) => logged.push(m)), /Refusing to seed/);
  const out = logged.join('\n');
  assert.match(out, /REFUSING TO SEED/);
  assert.doesNotMatch(out, /s3cret-pass|ep-test|postgres(ql)?:\/\//);
});

// ---- data: must satisfy the table's check constraints so the seed cannot fail halfway ----

test('seed apartments have unique names and are all marked as seed data', () => {
  const names = DEV_APARTMENTS.map((a) => a.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(DEV_APARTMENTS.length, 3);
  assert.equal(SEED_MARKER, 'dev-seed');
});

test('seed apartments use real calendar names', () => {
  assert.deepEqual(DEV_APARTMENTS.map((a) => a.name), ['Atlas', 'Berlin', 'Devetka']);
});

test('seed apartments satisfy the schema checks (area > 0, rent >= 0, phone format)', () => {
  for (const a of DEV_APARTMENTS) {
    assert.ok(a.area_m2 > 0, a.name);
    assert.ok(a.monthly_rent_eur >= 0, a.name);
    assert.match(a.owner_phone, /^[+]?[0-9]{6,15}$/, a.name);
    for (const k of ['address', 'apartment_number', 'building_name', 'owner_name']) assert.ok(a[k], `${a.name}.${k}`);
    assert.ok(Number.isInteger(a.floor), a.name);
  }
});
