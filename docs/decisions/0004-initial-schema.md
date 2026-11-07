# ADR 0004: Initial Postgres schema (Drizzle)

**Status:** Proposed
**Date:** 2026-11-07
**Project:** airtable-reservation-form
**Depends on:** [ADR 0001](0001-database.md), [ADR 0002](0002-postgres-roles.md), [ADR 0003](0003-soft-delete.md)

## Decision

- **Drizzle ORM + Drizzle Kit** manage the schema. The schema is TypeScript in `db/schema.ts`; migrations are reviewed SQL files in `db/migrations/`; how to change it is in [database-migrations.md](../database-migrations.md).
- Server side only: the mobile app never connects to the database. Drivers: `@neondatabase/serverless` for the runtime.
- Applied on the Neon `dev` branch (our test branch) as `neondb_owner`. Production was not touched.

## Conventions (every table)

English `snake_case` names. `id bigint generated always as identity`. `is_active boolean not null default true` (deactivate instead of delete). `created_at` and `updated_at` as `timestamptz not null default now()`, with a trigger that keeps `updated_at` current. `created_by` and `updated_by` as `text not null` (the user's name for now, later a foreign key to a users table). Money in EUR.

## Tables

- **`apartments`**: `name` (unique), `address`, `apartment_number`, `floor`, `building_name`, `area_m2` (> 0), `owner_name`, `owner_phone` (format check), `monthly_rent_eur` (>= 0), `has_bathtub`, `has_terrace`, `has_dishwasher` (default false), `parking_spot` (optional).
- **`reservations`**: `apartment_id` (foreign key, `ON DELETE RESTRICT`), `status` (`active` by default, `cancelled`, `no_show`), `channel` (`direct`, `booking`, `airbnb`, `local_agency`; no default, the user must choose), `check_in_date` and `check_out_date` (`date`, check-out after check-in), `guest_name`, `guest_phone` (format check), `note` (optional), `total_amount_eur` (`numeric(10,2)`, >= 0, the source of truth entered by the user), `price_per_night_eur` (generated and stored: `round(total_amount_eur / (check_out_date - check_in_date), 2)`).
- Phone format: an optional `+`, then 6 to 15 digits (`^[+]?[0-9]{6,15}$`). The app must normalize input (no spaces or dashes) before sending it.
- Check-in 14:00 and check-out 11:00 are app rules and are not stored. Dates are `YYYY-MM-DD` strings in the app (Drizzle `mode: 'string'`), never shifted through UTC.
- One index on `reservations (apartment_id, check_in_date, check_out_date)` for calendar queries (foreign keys are not indexed automatically).

## Differences from earlier ADRs

Recorded so the earlier documents are not read as current:

1. **No `guests` table.** ADRs 0001 and 0003 planned one (normalized phone as the unique key, deduplicated during the Airtable migration). Now the guest is `guest_name` and `guest_phone` on the reservation, so there is no guest deduplication and no guest history by key.
2. **`is_active boolean`, not `archived_at`.** This resolves the first open question of ADR 0003 (it loses the "when").
3. **No `inquiry` status.** The enum is `active`, `cancelled`, `no_show`. `api/_status.js` still has `Inquiry` and the Airtable names until the API moves to Postgres; a short-term calendar hold has to be modelled some other way if it is still needed.
4. **`apartments.name` is unique across all rows**, including inactive ones, not only among active rows (ADR 0003 suggested a partial unique index). A deactivated apartment keeps its name.
5. **No audit log table yet.** `created_by` and `updated_by` columns cover "who" for now; a full history table is future work.

## Not in this schema (next tasks)

- The double-booking exclusion constraint on (apartment, date range): needs `btree_gist`, a half-open range `[check_in_date, check_out_date)` and only for blocking rows (`status = 'active'`, and probably `is_active`). Separate branch.
- Accounting tables, advance payment, number of guests.
- Switching `api/*` from Airtable to Postgres and migrating the existing data.

## Verification (dev branch)

Both migrations applied. Tested with temporary rows (removed afterwards, tables are empty): all check, unique, not-null, enum and foreign-key rules reject bad input; the generated price is correct (150.00 over 3 nights is 50.00, 100.00 over 3 nights is 33.33); `updated_at` moves forward on update; `delta_app` can insert and update but not delete; `delta_readonly` can only read; an apartment with reservations cannot be deleted.

## Notes

- A check-out equal to the check-in is rejected, but with `division by zero` (22012) rather than the check constraint, because the generated column is evaluated first. Validate dates in the API before the insert.
- Migrations still need a safe path to production (production credentials live only in Vercel). To be decided.
