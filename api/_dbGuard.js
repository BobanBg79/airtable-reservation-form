// Dev-only safety net for database credentials (see docs/decisions/0002-postgres-roles.md,
// section "Local env safety"). Files starting with "_" in api/ are not exposed as routes.
//
// Rule: locally the running app must connect as `delta_app` to the `dev` Neon branch, never as the
// owner and never to production. The messages below only ever contain role and branch names,
// never connection strings or passwords.

export const APP_ROLE = 'delta_app';
export const OWNER_ROLE = 'neondb_owner'; // migrations only (drizzle.config.ts); never the running app
export const DEV_BRANCH = 'dev';

/** Role (user) name from a postgres:// URL, or undefined. Never returns the password. */
export function roleOf(url) {
  const m = /^postgres(?:ql)?:\/\/([^:@/]+)/.exec(url ?? '');
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** True on a developer machine (or `vercel dev`); false on Vercel preview/production. */
export function isLocalDev(env) {
  return env.NODE_ENV !== 'production' && (env.VERCEL_ENV === undefined || env.VERCEL_ENV === 'development');
}

/**
 * Pure check. Returns { ok, skipped, problems[] }.
 *
 * By default it is skipped on Vercel preview/production, which use their own variables.
 * Pass `{ force: true }` for scripts that read `.env.local` (check:env, db:seed): it never skips,
 * and a file that describes a production or preview environment (`VERCEL_ENV`, `NODE_ENV`) is itself
 * a problem. Without this, a pulled production env file would switch the check off.
 */
export function checkDevDatabaseEnv(env = process.env, { force = false } = {}) {
  if (!force && !isLocalDev(env)) return { ok: true, skipped: true, problems: [] };

  const problems = [];

  if (force && !isLocalDev(env)) {
    problems.push('The environment variables describe Vercel production or preview (VERCEL_ENV or NODE_ENV); .env.local must be a dev file.');
  }

  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set.');
  for (const name of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    if (!env[name]) continue;
    const role = roleOf(env[name]);
    if (role !== APP_ROLE) {
      problems.push(`${name} connects as "${role ?? 'unknown'}" but must connect as "${APP_ROLE}".`);
    }
  }

  if (env.NEON_BRANCH !== DEV_BRANCH) {
    problems.push(`NEON_BRANCH is "${env.NEON_BRANCH ?? 'unset'}" but must be "${DEV_BRANCH}".`);
  }

  return { ok: problems.length === 0, skipped: false, problems };
}

/**
 * Call once at startup of any code that opens a database connection.
 * In local dev it logs a loud warning and throws (refuses to start) when the check fails.
 */
export function assertDevDatabaseSafe(env = process.env, log = console.error) {
  const result = checkDevDatabaseEnv(env);
  if (!result.ok) {
    const bar = '!'.repeat(72);
    log(
      [
        bar,
        '!! UNSAFE DATABASE CONFIGURATION: REFUSING TO START',
        ...result.problems.map((p) => `!! - ${p}`),
        '!! Fix .env.local (see docs/decisions/0002-postgres-roles.md, "Local env safety").',
        bar,
      ].join('\n'),
    );
    throw new Error(`Refusing to start: ${result.problems.join(' ')}`);
  }
  return result;
}
