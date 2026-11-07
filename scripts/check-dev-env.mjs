// `npm run check:env`: verifies .env.local against the local env safety rules
// (docs/decisions/0002-postgres-roles.md). Run it after every `neon deploy`, `neon env`,
// `neon init` or `neon checkout`. Prints role and branch names only, never connection strings.
import { checkDevDatabaseEnv, roleOf } from '../api/_dbGuard.js';
import { loadEnvLocal } from './load-env-local.mjs';

const env = loadEnvLocal();
if (!env) {
  console.error('.env.local not found. Nothing to check.');
  process.exit(1);
}

// Only .env.local values are checked; the shell's NODE_ENV/VERCEL_ENV do not matter here.
const result = checkDevDatabaseEnv(env, { force: true });

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
