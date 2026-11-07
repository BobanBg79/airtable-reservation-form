// The one place that opens a connection to Neon.
//
// Loading this module runs the dev safety check (docs/decisions/0002-postgres-roles.md): in local
// dev it throws unless the database user is delta_app and NEON_BRANCH is dev. On Vercel production
// and preview the check is skipped and the project's own environment variables apply.
import { neon } from '@neondatabase/serverless';
import { assertDevDatabaseSafe } from './_dbGuard.js';

assertDevDatabaseSafe();

let client;

/** SQL client over HTTPS (works from serverless functions). Use `sql.query(text, params)`; never build SQL by string concatenation. */
export function getSql() {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}
