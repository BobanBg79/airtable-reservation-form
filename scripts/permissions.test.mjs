// Keeps the permission list in packages/core, the reference-data migration and the dev database
// identical (ADR 0007). The database part runs only when .env.local exists and the database answers;
// it reads as delta_app (SELECT only).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { neon } from '@neondatabase/serverless';
import { INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../packages/core/src/models/permissions.ts';
import { ROOT, loadEnvLocal } from './load-env-local.mjs';

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
  const expected = PERMISSIONS.filter((p) => !INITIAL_ROLE_PERMISSIONS.business_owner.includes(p));
  assert.deepEqual(excluded.sort(), [...expected].sort());
  assert.deepEqual(INITIAL_ROLE_PERMISSIONS.business_owner, INITIAL_ROLE_PERMISSIONS.manager);
});

const env = loadEnvLocal();
const sql = env?.DATABASE_URL ? neon(env.DATABASE_URL) : null;
let reachable = false;
if (sql) {
  try {
    await sql.query('select 1');
    reachable = true;
  } catch {
    reachable = false;
  }
}
const dbTest = (name, fn) => test(name, { skip: reachable ? false : 'dev database not reachable' }, fn);

dbTest('the dev database has exactly the roles and permissions of packages/core', async () => {
  const roles = await sql.query('select name from roles');
  const permissions = await sql.query('select name from permissions');
  assert.deepEqual(roles.map((r) => r.name).sort(), [...ROLES].sort());
  assert.deepEqual(permissions.map((r) => r.name).sort(), [...PERMISSIONS].sort());
});

dbTest('the dev database gives every role its initial permissions (admin all of them)', async () => {
  const rows = await sql.query(
    `select r.name as role, p.name as permission
       from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id
      where rp.is_active`,
  );
  for (const role of ROLES) {
    const have = rows.filter((x) => x.role === role).map((x) => x.permission).sort();
    // Admin can never lose a permission, so it always equals the initial set. The other roles may
    // have been adjusted by the admin since the migration, so they only have to use known names.
    if (role === 'admin') assert.deepEqual(have, [...INITIAL_ROLE_PERMISSIONS.admin].sort());
    else for (const p of have) assert.ok(PERMISSIONS.includes(p), `${role} has unknown permission ${p}`);
  }
});

dbTest('only the admin role is protected', async () => {
  const rows = await sql.query('select name from roles where is_protected');
  assert.deepEqual(rows.map((r) => r.name), ['admin']);
});
