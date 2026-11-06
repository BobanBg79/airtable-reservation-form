// `npm run check:env`: verifies .env.local against the local env safety rules
// (docs/decisions/0002-postgres-roles.md). Run it after every `neon deploy`, `neon env`,
// `neon init` or `neon checkout`. Prints role and branch names only, never connection strings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDevDatabaseEnv, roleOf } from '../api/_dbGuard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, '.env.local');

if (!fs.existsSync(file)) {
  console.error('.env.local not found. Nothing to check.');
  process.exit(1);
}

const env = {};
// Strip a UTF-8 BOM: PowerShell 5.1 adds one, and it hides the first variable from the regex below.
for (const line of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const result = checkDevDatabaseEnv(env); // only .env.local values: ignores the shell's NODE_ENV/VERCEL_ENV

for (const name of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'MIGRATION_DATABASE_URL', 'READONLY_DATABASE_URL']) {
  console.log(`${name.padEnd(24)} role=${roleOf(env[name]) ?? '(not set)'}`);
}
console.log(`${'NEON_BRANCH'.padEnd(24)} ${env.NEON_BRANCH ?? '(not set)'}`);

if (!result.ok) {
  console.error('\nUNSAFE .env.local:');
  for (const p of result.problems) console.error(`  - ${p}`);
  console.error('Fix it before running the app, and tell the owner.');
  process.exit(1);
}
console.log('\n.env.local is safe: delta_app on the dev branch.');
