// `npm run db:seed`: fills the Neon DEV branch with fake data (see scripts/seed-data.mjs):
// three apartments and ten reservations around today (Europe/Belgrade).
//
// Safety, in layers (nothing here is wired into any build, install or deploy step):
//   1. Manual command only. It lives in scripts/, outside api/, and no npm lifecycle hook calls it.
//   2. Environment guard (scripts/local-guard.mjs): refuses on Vercel, CI, NODE_ENV=production, a
//      DATABASE_URL in the shell, a role other than delta_app, or a branch other than dev.
//      Connection details come from .env.local only.
//   3. Data guard: refuses if apartments or reservations hold any row not created by this seed, so it
//      can never add fake rows next to real data, even if the checks above were somehow fooled.
//   4. Runs as delta_app (INSERT only, no DELETE, no DDL), and is idempotent: apartments are matched
//      by name, and reservations are added only while there are none from the seed.
import { neon } from '@neondatabase/serverless';
import { todayInBelgrade } from '../packages/core/src/models/date.ts';
import { loadEnvLocal } from './load-env-local.mjs';
import { assertLocalScriptAllowed } from './local-guard.mjs';
import { DEV_APARTMENTS, SEED_MARKER, buildDevReservations } from './seed-data.mjs';

const fileEnv = loadEnvLocal();
if (!fileEnv) {
  console.error('.env.local not found.');
  process.exit(1);
}

try {
  assertLocalScriptAllowed(fileEnv, process.env);
} catch {
  process.exit(1);
}

const sql = neon(fileEnv.DATABASE_URL);

for (const table of ['apartments', 'reservations']) {
  const foreign = await sql.query(`select count(*)::int as n from ${table} where created_by <> $1`, [SEED_MARKER]);
  if (foreign[0].n > 0) {
    console.error(`REFUSING TO SEED: ${table} already contains ${foreign[0].n} row(s) not created by the seed (real data?).`);
    process.exit(1);
  }
}

// ---- apartments (matched by name, so running again adds nothing) ----
let apartmentsAdded = 0;
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
  apartmentsAdded += rows.length;
  console.log(`${rows.length ? 'added  ' : 'exists '} apartment ${a.name}`);
}

// ---- reservations (all or nothing, and only while the seed has none) ----
const existing = await sql.query('select count(*)::int as n from reservations where created_by = $1', [SEED_MARKER]);
let reservationsAdded = 0;
if (existing[0].n > 0) {
  console.log(`exists  ${existing[0].n} reservations from an earlier seed (left as they are)`);
} else {
  const today = todayInBelgrade();
  const planned = buildDevReservations(today);

  const names = [...new Set(planned.map((r) => r.apartment_name))];
  const idRows = await sql.query('select id, name from apartments where name = any($1::text[])', [names]);
  const idByName = new Map(idRows.map((r) => [r.name, r.id]));
  const missing = names.filter((n) => !idByName.has(n));
  if (missing.length) {
    console.error(`REFUSING TO SEED: apartments missing for the reservations: ${missing.join(', ')}.`);
    process.exit(1);
  }

  // One transaction, so a failure cannot leave a partial set behind (which would block a rerun).
  await sql.transaction(
    planned.map((r) =>
      sql.query(
        `insert into reservations
           (apartment_id, channel, check_in_date, check_out_date, guest_name, guest_phone,
            total_amount_eur, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [idByName.get(r.apartment_name), r.channel, r.check_in_date, r.check_out_date, r.guest_name,
         r.guest_phone, r.total_amount_eur, SEED_MARKER],
      ),
    ),
  );
  reservationsAdded = planned.length;
  const first = planned.map((r) => r.check_in_date).sort()[0];
  const last = planned.map((r) => r.check_out_date).sort().at(-1);
  console.log(`added   ${planned.length} reservations around ${today} (${first} to ${last})`);
}

const counts = await sql.query('select (select count(*) from apartments)::int as a, (select count(*) from reservations)::int as r');
console.log(`\nSeed done on the dev branch: ${apartmentsAdded} apartments and ${reservationsAdded} reservations added; ${counts[0].a} apartments and ${counts[0].r} reservations in total.`);
