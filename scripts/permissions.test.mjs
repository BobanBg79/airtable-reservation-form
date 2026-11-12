// Keeps the permission list in packages/core and the reference-data migration identical. Reads files only: no
// database, no network. The checks against the real dev database are in permissions.dbtest.mjs (`npm run test:db`).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../packages/core/src/models/permissions.ts';
import { ROOT } from './load-env-local.mjs';

const MIGRATIONS_DIR = path.join(ROOT, 'db/migrations');
const MIGRATION = fs.readFileSync(path.join(MIGRATIONS_DIR, '0003_access_reference_data.sql'), 'utf8');
const ALL_MIGRATIONS = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));

/** The quoted names in the first column of the rows of every `INSERT INTO "<table>" (...) VALUES ...;` in `sources`. */
function insertedNames(table, sources = ALL_MIGRATIONS) {
  const names = [];
  for (const source of sources) {
    for (const m of source.matchAll(new RegExp(`INSERT INTO "${table}"[^;]*?VALUES([^;]*);`, 'gs'))) {
      names.push(...[...m[1].matchAll(/^\s*\('([a-z_]+)'/gm)].map((x) => x[1]));
    }
  }
  assert.ok(names.length > 0, `no INSERT INTO "${table}" in the migrations`);
  return names;
}

test('the migrations insert exactly the roles and permissions of packages/core', () => {
  assert.deepEqual(insertedNames('roles').sort(), [...ROLES].sort());
  assert.deepEqual(insertedNames('permissions').sort(), [...PERMISSIONS].sort());
});

test('the first migration inserted the 19 permissions of the beginning, the Manage roles migration the other two', () => {
  assert.equal(insertedNames('permissions', [MIGRATION]).length, 19);
  const manageRoles = ALL_MIGRATIONS.find((m) => m.includes("'can_view_role'"));
  assert.deepEqual(insertedNames('permissions', [manageRoles]), ['can_view_role', 'can_edit_role']);
});

test('the Manage roles migration grants its two permissions to the admin role only', () => {
  const manageRoles = ALL_MIGRATIONS.find((m) => m.includes("'can_view_role'"));
  assert.match(manageRoles, /WHERE r\."name" = 'admin' AND p\."name" IN \('can_view_role', 'can_edit_role'\)/);
  assert.doesNotMatch(manageRoles, /business_owner|manager|cleaning_lady|handyman/);
});

test('the first migration gives business_owner and manager everything except the three user permissions', () => {
  const excluded = [...MIGRATION.matchAll(/NOT IN \(([^)]*)\)/g)][0][1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(excluded.sort(), ['can_create_user', 'can_edit_user', 'can_view_user']);
});

test('in packages/core business_owner and manager start with the same 16 (nothing for users or roles)', () => {
  assert.deepEqual(INITIAL_ROLE_PERMISSIONS.business_owner, INITIAL_ROLE_PERMISSIONS.manager);
  assert.equal(INITIAL_ROLE_PERMISSIONS.manager.length, 16);
});
