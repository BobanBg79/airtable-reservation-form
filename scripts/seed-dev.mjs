// `npm run db:seed`: fills the Neon DEV branch with three fake apartments (see scripts/seed-data.mjs).
//
// Safety, in layers (nothing here is wired into any build, install or deploy step):
//   1. Manual command only. It lives in scripts/, outside api/, and no npm lifecycle hook calls it.
//   2. Environment guard (scripts/seed-guard.mjs): refuses on Vercel, CI, NODE_ENV=production, a
//      DATABASE_URL in the shell, a role other than delta_app, or a branch other than dev.
//      Connection details come from .env.local only.
//   3. Data guard: refuses if the apartments table holds any row not created by this seed, so it can
//      never add fake rows next to real data, even if the checks above were somehow fooled.
//   4. Runs as delta_app (INSERT only, no DELETE, no DDL), and is idempotent: running it twice adds nothing.
import { neon } from '@neondatabase/serverless';
import { loadEnvLocal } from './load-env-local.mjs';
import { DEV_APARTMENTS, SEED_MARKER } from './seed-data.mjs';
import { assertSeedAllowed } from './seed-guard.mjs';

const fileEnv = loadEnvLocal();
if (!fileEnv) {
  console.error('.env.local not found.');
  process.exit(1);
}

try {
  assertSeedAllowed(fileEnv, process.env);
} catch {
  process.exit(1);
}

const sql = neon(fileEnv.DATABASE_URL);

const foreign = await sql.query('select count(*)::int as n from apartments where created_by <> $1', [SEED_MARKER]);
if (foreign[0].n > 0) {
  console.error(`REFUSING TO SEED: apartments already contains ${foreign[0].n} row(s) not created by the seed (real data?).`);
  process.exit(1);
}

let inserted = 0;
for (const a of DEV_APARTMENTS) {
  const rows = await sql.query(
    `insert into apartments
       (name, address, apartment_number, floor, building_name, area_m2, owner_name, owner_phone,
        monthly_rent_eur, has_bathtub, has_terrace, has_dishwasher, parking_spot, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     on conflict (name) do nothing
     returning name`,
    [a.name, a.address, a.apartment_number, a.floor, a.building_name, a.area_m2, a.owner_name, a.owner_phone,
     a.monthly_rent_eur, a.has_bathtub, a.has_terrace, a.has_dishwasher, a.parking_spot, SEED_MARKER],
  );
  inserted += rows.length;
  console.log(`${rows.length ? 'added  ' : 'exists '} ${a.name}`);
}

const total = await sql.query('select count(*)::int as n from apartments');
console.log(`\nSeed done on the dev branch: ${inserted} added, ${total[0].n} apartments in total.`);
