// Keeps the permission list in packages/core and the reference-data migration identical. Reads files only: no
// database, no network. The checks against the real dev database are in permissions.dbtest.mjs (`npm run test:db`).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../packages/core/src/models/permissions.ts';
import { ROOT } from './load-env-local.mjs';

const MIGRATION = fs.readFileSync(path.join(ROOT, 'db/migrations/0003_access_reference_data.sql'), 'utf8');

/** The quoted names in the first column of the rows of `INSERT INTO "<table>" (...) VALUES ...;`. */
function insertedNames(table) {
  const m = MIGRATION.match(new RegExp(`INSERT INTO "${table}"[^;]*?VALUES([^;]*);`, 's'));
  assert.ok(m, `no INSERT INTO "${table}" in the migration`);
  return [...m[1].matchAll(/^\s*\('([a-z_]+)'/gm)].map((x) => x[1]);
}

test('the reference-data migration inserts exactly the roles and permissions of packages/core', () => {
  assert.deepEqual(insertedNames('roles').sort(), [...ROLES].sort());
  assert.deepEqual(insertedNames('permissions').sort(), [...PERMISSIONS].sort());
});

test('the migration gives business_owner and manager everything except the user permissions', () => {
  const excluded = [...MIGRATION.matchAll(/NOT IN \(([^)]*)\)/g)][0][1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(excluded.sort(), ['can_create_user', 'can_edit_user', 'can_view_user']);
  assert.deepEqual(INITIAL_ROLE_PERMISSIONS.business_owner, INITIAL_ROLE_PERMISSIONS.manager);
});
