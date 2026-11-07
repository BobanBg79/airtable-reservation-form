// Guards for the dev seed (scripts/seed-dev.mjs). The seed may only run on a developer machine,
// against the Neon `dev` branch, as `delta_app`, with connection details taken from .env.local.
// The role and branch rule lives in api/_dbGuard.js and is reused here; this file only adds what is
// specific to seeding. Messages contain names only, never connection strings or passwords.
import { checkDevDatabaseEnv } from '../api/_dbGuard.js';

/**
 * @param fileEnv    variables parsed from .env.local (the only source of connection details)
 * @param processEnv the real process environment (checked for signs of CI, Vercel or production)
 * @returns { ok, problems[] }
 */
export function checkSeedAllowed(fileEnv, processEnv) {
  // Role and branch rule, shared with check:env. `force` keeps it from switching itself off when
  // the file says VERCEL_ENV=production.
  const problems = [...checkDevDatabaseEnv(fileEnv, { force: true }).problems];

  // Seed-only rules: never on Vercel, CI or a production-like shell.
  if (processEnv.VERCEL || processEnv.VERCEL_ENV) problems.push('Running on Vercel: the seed never runs there.');
  if (processEnv.CI) problems.push('Running in CI: the seed never runs there.');
  if (processEnv.NODE_ENV === 'production') problems.push('NODE_ENV is "production".');

  // A DATABASE_URL in the shell could be a production string (for example from `vercel env pull`).
  // The seed ignores it and refuses to run, so nobody has to wonder which one is used.
  if (processEnv.DATABASE_URL) problems.push('DATABASE_URL is set in the shell environment; unset it. The seed reads .env.local only.');

  return { ok: problems.length === 0, problems };
}

export function assertSeedAllowed(fileEnv, processEnv, log = console.error) {
  const r = checkSeedAllowed(fileEnv, processEnv);
  if (!r.ok) {
    log(['REFUSING TO SEED:', ...r.problems.map((p) => `  - ${p}`)].join('\n'));
    throw new Error(`Refusing to seed: ${r.problems.join(' ')}`);
  }
  return r;
}
