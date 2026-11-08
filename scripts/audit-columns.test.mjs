// Checks on the dev database that created_by / updated_by are foreign keys to users everywhere
// (migration 0005, ADR 0007) and that the dev-seed system user cannot sign in. Skipped when the
// database is not reachable. Reads as delta_app (SELECT only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { neon } from '@neondatabase/serverless';
import { loadEnvLocal } from './load-env-local.mjs';
import { SEED_USER_EMAIL } from './seed-data.mjs';

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

const TABLES = ['apartments', 'reservations', 'users', 'roles', 'permissions', 'role_permissions'];

dbTest('created_by and updated_by are bigint foreign keys to users on every table', async () => {
  const cols = await sql.query(
    `select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and column_name in ('created_by', 'updated_by')`,
  );
  assert.equal(cols.length, TABLES.length * 2);
  for (const c of cols) assert.equal(c.data_type, 'bigint', `${c.table_name}.${c.column_name}`);

  const fks = await sql.query(
    `select conrelid::regclass::text as tbl, a.attname as col
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and c.confrelid = 'public.users'::regclass and a.attname in ('created_by', 'updated_by')`,
  );
  for (const t of TABLES) {
    for (const col of ['created_by', 'updated_by']) {
      assert.ok(fks.some((f) => f.tbl === t && f.col === col), `${t}.${col} has no foreign key to users`);
    }
  }
});

dbTest('the dev-seed system user exists, is inactive and has no usable password', async () => {
  const rows = await sql.query('select is_active, password_hash from users where email = $1', [SEED_USER_EMAIL]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_active, false);
  assert.ok(!rows[0].password_hash.startsWith('$2'), 'must not be a bcrypt hash');
});
