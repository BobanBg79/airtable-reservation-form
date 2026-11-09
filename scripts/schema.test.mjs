// Checks db/schema.ts as text, with no database: every table has the audit columns (created_by and updated_by,
// foreign keys to users, ADR 0007) except login_attempts, the one documented exception (ADR 0004, ADR 0008).
// The same rule on the real database is in audit-columns.dbtest.mjs (`npm run test:db`).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from './load-env-local.mjs';

const SCHEMA = fs.readFileSync(path.join(ROOT, 'db/schema.ts'), 'utf8');
const EXCEPTIONS = ['loginAttempts'];

/** [{ name: 'apartments', body: '...' }] for every `export const x = pgTable(...)` up to the next one. */
function tables() {
  const starts = [...SCHEMA.matchAll(/^export const (\w+) = pgTable\(/gm)];
  return starts.map((m, i) => ({ name: m[1], body: SCHEMA.slice(m.index, starts[i + 1]?.index ?? SCHEMA.length) }));
}

test('the audit helper makes created_by and updated_by not null foreign keys to users', () => {
  const helper = SCHEMA.match(/const audit = \(\) => \(\{([\s\S]*?)\n\}\);/);
  assert.ok(helper, 'the audit() helper is missing');
  for (const column of ['created_by', 'updated_by']) {
    assert.match(helper[1], new RegExp(`bigint\\('${column}'[\\s\\S]*?\\.notNull\\(\\)[\\s\\S]*?\\.references\\(\\(\\): AnyPgColumn => users\\.id`), column);
  }
});

test('every table spreads the audit columns, except login_attempts', () => {
  const all = tables();
  assert.ok(all.length >= 8, `only ${all.length} tables found`);
  assert.ok(all.some((t) => t.name === 'loginAttempts'), 'loginAttempts must exist');
  for (const t of all) {
    if (EXCEPTIONS.includes(t.name)) assert.doesNotMatch(t.body, /\.\.\.audit\(\)/, `${t.name} is the insert-only exception`);
    else assert.match(t.body, /\.\.\.audit\(\)/, `${t.name} has no audit columns`);
  }
});
