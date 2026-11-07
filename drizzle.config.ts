// Drizzle Kit config. Migrations run as `neondb_owner` against the Neon `dev` branch only
// (docs/decisions/0002-postgres-roles.md, "Local env safety"). The connection string is read from
// MIGRATION_DATABASE_URL in .env.local and is never hardcoded or printed. neon.ts is the separate
// Neon CLI branch policy; the two do not overlap.
import { defineConfig } from 'drizzle-kit';
import { DEV_BRANCH, OWNER_ROLE, roleOf } from './api/_dbGuard.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local (for example in CI): rely on variables already in the environment.
}

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  throw new Error('MIGRATION_DATABASE_URL is not set (expected in .env.local).');
}

// Refuse to run against anything but the owner role on the dev branch. Messages carry names only.
// Role and branch names come from api/_dbGuard.js, the single place that defines them.
const role = roleOf(url);
if (role !== OWNER_ROLE) {
  throw new Error(`Migrations must run as "${OWNER_ROLE}", but MIGRATION_DATABASE_URL uses "${role ?? 'unknown'}".`);
}
if (process.env.NEON_BRANCH !== DEV_BRANCH) {
  throw new Error(`NEON_BRANCH is "${process.env.NEON_BRANCH ?? 'unset'}" but must be "${DEV_BRANCH}". Never migrate production from this machine.`);
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
