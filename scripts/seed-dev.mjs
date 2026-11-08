// `npm run db:seed`: fills the Neon DEV branch with fake data (see scripts/seed-data.mjs):
// nine apartments (real names, made-up details) and their reservations around the base date.
//
// Safety, in layers (nothing here is wired into any build, install or deploy step):
//   1. Manual command only. It lives in scripts/, outside api/, and no npm lifecycle hook calls it.
//   2. Environment guard (scripts/local-guard.mjs): refuses on Vercel, CI, NODE_ENV=production, a
//      DATABASE_URL in the shell, a role other than delta_app, or a branch other than dev.
//      Connection details come from .env.local only.
//   3. Data guard: refuses if apartments or reservations hold any row not created by the dev-seed user, so it
//      can never add fake rows next to real data, even if the checks above were somehow fooled.
//   4. Runs as delta_app (INSERT only, no DELETE, no DDL), and is idempotent: an apartment is matched
//      by name, a reservation by apartment, guest and dates among the ACTIVE ones (deactivated old seed rows are
//      ignored, see "Dev reset" in docs/database-migrations.md), so running it again adds only what is missing.
import { neon } from '@neondatabase/serverless';
import { todayInBelgrade } from '../packages/core/src/models/date.ts';
import { loadEnvLocal } from './load-env-local.mjs';
import { assertLocalScriptAllowed } from './local-guard.mjs';
import { DEV_APARTMENTS, SEED_BASE_DATE, SEED_USER_EMAIL, buildDevReservations } from './seed-data.mjs';

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

// The rows of this seed belong to the system user `dev-seed` (created by migration 0005).
const seedUser = await sql.query('select id from users where email = $1', [SEED_USER_EMAIL]);
if (seedUser.length === 0) {
  console.error(`REFUSING TO SEED: the system user ${SEED_USER_EMAIL} does not exist. Run the migrations first (npm run db:migrate).`);
  process.exit(1);
}
const SEED_USER_ID = seedUser[0].id;

for (const table of ['apartments', 'reservations']) {
  const foreign = await sql.query(`select count(*)::int as n from ${table} where created_by <> $1::bigint`, [SEED_USER_ID]);
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
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::bigint,$14::bigint)
     on conflict (name) do nothing
     returning name`,
    [a.name, a.address, a.apartment_number, a.floor, a.building_name, a.area_m2, a.owner_name, a.owner_phone,
     a.monthly_rent_eur, a.has_bathtub, a.has_terrace, a.has_dishwasher, a.parking_spot, SEED_USER_ID],
  );
  apartmentsAdded += rows.length;
  console.log(`${rows.length ? 'added  ' : 'exists '} apartment ${a.name}`);
}

// ---- reservations (each one only if it is not there yet; all in one transaction) ----
const planned = buildDevReservations();
const names = [...new Set(planned.map((r) => r.apartment_name))];
const idRows = await sql.query('select id, name from apartments where name = any($1::text[])', [names]);
const idByName = new Map(idRows.map((r) => [r.name, r.id]));
const missing = names.filter((n) => !idByName.has(n));
if (missing.length) {
  console.error(`REFUSING TO SEED: apartments missing for the reservations: ${missing.join(', ')}.`);
  process.exit(1);
}

const results = await sql.transaction(
  planned.map((r) =>
    sql.query(
      `insert into reservations
         (apartment_id, channel, check_in_date, check_out_date, guest_name, guest_phone,
          total_amount_eur, created_by, updated_by)
       select $1::bigint, $2::reservation_channel, $3::date, $4::date, $5::text, $6::text, $7::numeric, $8::bigint, $8::bigint
        where not exists (
          select 1 from reservations
           where apartment_id = $1::bigint and guest_name = $5::text
             and check_in_date = $3::date and check_out_date = $4::date
             and is_active)
       returning id`,
      [idByName.get(r.apartment_name), r.channel, r.check_in_date, r.check_out_date, r.guest_name,
       r.guest_phone, r.total_amount_eur, SEED_USER_ID],
    ),
  ),
);
const reservationsAdded = results.filter((rows) => rows.length > 0).length;
console.log(`${reservationsAdded ? 'added  ' : 'exists '} reservations: ${reservationsAdded} added, ${planned.length - reservationsAdded} already there (base date ${SEED_BASE_DATE})`);

// The data is laid out from a fixed day, so it ages. Say so once it is mostly in the past.
const today = todayInBelgrade();
const last = planned.map((r) => r.check_out_date).sort().at(-1);
if (last < today) {
  console.warn(`NOTE: every seeded stay ends before today (${today}). Deactivate the old seed reservations and move SEED_BASE_DATE forward (docs/database-migrations.md, "Dev reset").`);
}

const counts = await sql.query('select (select count(*) from apartments)::int as a, (select count(*) from reservations)::int as r');
console.log(`\nSeed done on the dev branch: ${apartmentsAdded} apartments added; ${counts[0].a} apartments and ${counts[0].r} reservations in total.`);
