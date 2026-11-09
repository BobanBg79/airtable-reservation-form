// Checks on the real dev database (not part of `npm test`; run it on purpose with `npm run test:db`):
// the roles and permissions equal packages/core, the admin role is protected, every table refuses DELETE and
// TRUNCATE through its triggers, and delta_app has no DELETE or TRUNCATE privilege (ADR 0007). Reads as delta_app
// (SELECT only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { neon } from '@neondatabase/serverless';
import { INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../packages/core/src/models/permissions.ts';
import { loadEnvLocal } from './load-env-local.mjs';

// `npm run test:db` is run on purpose, so an unreachable database is a failure, not a skip.
const env = loadEnvLocal();
if (!env?.DATABASE_URL) throw new Error('.env.local with DATABASE_URL (role delta_app, branch dev) is needed for test:db.');
const sql = neon(env.DATABASE_URL);
await sql.query('select 1');
const dbTest = test;

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

dbTest('every table has the DELETE and TRUNCATE triggers that refuse for any role', async () => {
  const tables = (await sql.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).map((r) => r.tablename);
  assert.ok(tables.includes('sessions') && tables.includes('login_attempts'), 'the authentication tables must exist');
  const triggers = await sql.query(
    `select c.relname as tbl, t.tgname as name, t.tgfoid::regproc::text as fn
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'public'::regnamespace and not t.tgisinternal`,
  );
  for (const tbl of tables) {
    for (const kind of ['delete', 'truncate']) {
      const found = triggers.find((t) => t.tbl === tbl && t.name === `${tbl}_refuse_${kind}`);
      assert.ok(found, `${tbl} has no ${kind} trigger`);
      assert.match(found.fn, /refuse_delete/);
    }
  }
});

dbTest('delta_app can never DELETE or TRUNCATE, and login_attempts is insert only', async () => {
  const tables = (await sql.query(`select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename);
  const privilege = async (table, p) =>
    (await sql.query('select has_table_privilege(current_user, $1, $2) as ok', [`public.${table}`, p]))[0].ok;
  for (const t of tables) {
    assert.equal(await privilege(t, 'DELETE'), false, `${t}: DELETE`);
    assert.equal(await privilege(t, 'TRUNCATE'), false, `${t}: TRUNCATE`);
  }
  assert.equal(await privilege('login_attempts', 'INSERT'), true);
  assert.equal(await privilege('login_attempts', 'SELECT'), true);
  assert.equal(await privilege('login_attempts', 'UPDATE'), false);
  assert.equal(await privilege('sessions', 'UPDATE'), true); // the expiry slides
});
