# TODO

Planned work. Decisions live in `docs/decisions/` (ADRs), known problems in `KNOWN_ISSUES.md`. Add new tasks at the bottom of "Next tasks"; move a task to "Done" with its commit when finished.

## Next tasks

### Task: `inquiry` reservation status (short-term hold)

**Branch (suggested):** `feature/inquiry-status`, after `feature/drizzle-schema` is on `main`.
**Related:** ADR 0004 (open question 2), ADR 0001 (exclusion constraint), `api/_status.js`.

**Why.** An inquiry is a short-term hold: the calendar is blocked for some dates while a guest decides. Users often do not know or do not enter all the data at that moment (no phone, no channel, no price). Today the schema has only `active`, `cancelled` and `no_show`, and every reservation needs all fields.

**Decision (recommended in ADR 0004, pending the owner's confirmation).** Keep inquiries in `reservations` with `status = 'inquiry'` instead of a separate table. A hold must block dates, and one exclusion constraint can only cover rows of a single table; a separate table would need triggers or app-side checks to stop an inquiry and a reservation from overlapping.

**Schema changes (new migrations, never edit applied ones).**
1. Migration A: add `'inquiry'` to the `reservation_status` enum (`ALTER TYPE ... ADD VALUE`). Keep this in its **own migration**: Postgres does not allow using a new enum value in the same transaction that adds it, and Drizzle runs a migration in one transaction.
2. Migration B:
   - Drop `NOT NULL` on `guest_name`, `guest_phone`, `channel`, `total_amount_eur` and on the generated `price_per_night_eur` (it becomes null when there is no total).
   - Add a check, for example `reservations_complete_unless_inquiry`: `status = 'inquiry' OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL AND channel IS NOT NULL AND total_amount_eur IS NOT NULL)`.
   - The existing phone-format and amount checks keep working: a check passes on `NULL`.
3. Keep always required: `apartment_id`, `check_in_date`, `check_out_date`, `status`, `created_by`, `updated_by`.
4. Update `db/schema.ts` (nullable columns, new enum value, the check) and generate with `npm run db:generate`, review the SQL, apply on `dev` only.

**Behaviour.**
- An inquiry can be created with just apartment, dates and optionally a name, phone, channel, amount, note.
- Turning an inquiry into a reservation is an `UPDATE` of `status` to `active`; the check refuses it until all required fields are filled.
- An inquiry blocks the calendar like an active reservation. Cancelling it (`cancelled`) frees the dates.
- Optional, to decide: a nullable `hold_expires_at timestamptz` so a forgotten hold can be released automatically (a scheduled job sets expired inquiries to `cancelled`). Without it, holds stay until someone changes them.

**Depends on / interacts with.**
- The double-booking exclusion constraint (Task 2) must treat `active` and `inquiry` as blocking, and `cancelled` and `no_show` as free. Do this task before it or together with it.
- `api/_status.js` already has `Inquiry`; map it to the enum value when the API moves to Postgres.
- The calendar API should return `status`, and the app should draw inquiries differently (for example lighter or hatched bars). That is a separate frontend subtask.
- Update ADR 0004 (difference 3 and open question 2) and the table in `docs/database-migrations.md` if error codes change.

**Acceptance criteria (test on `dev`, then clean up).**
- Insert an inquiry with only apartment and dates: allowed.
- Insert `active` without guest name, phone, channel or amount: rejected (`23514`).
- Update an inquiry to `active` while a required field is empty: rejected; after filling them: allowed.
- Phone format and non-negative amount checks still reject bad values when the fields are present.
- `price_per_night_eur` is null for an inquiry without a total and correct once a total is set.
- `delta_app` can insert and update but not delete; `delta_readonly` can only read.
- `npm run typecheck` and `npm test` pass.

**Out of scope.** Blocks that are not a guest (maintenance, owner using the apartment): to be decided separately. If needed, a small `calendar_blocks` table plus a trigger or app check is the alternative (see the discussion in ADR 0004).

## Backlog

- Task 2: double-booking exclusion constraint on (apartment, date range): `btree_gist`, half-open range, blocking statuses only (see ADR 0001, 0004).
- Switch `api/*` from Airtable to Postgres: connection module that calls `assertDevDatabaseSafe()`, endpoints for list, calendar, create, edit and cancel, with error-code mapping (see `docs/database-migrations.md`).
- Migrate the existing Airtable data into Postgres.
- Production: roles on the `production` branch with new passwords, `DATABASE_URL` only in Vercel, and a safe way to run migrations for production (ADR 0004, open question 1).
- Backups: scheduled `pg_dump` to external storage and a restore test into `dev` (ADR 0001).
- Retire Airtable once the app runs on Postgres.
- Decide how to handle non-guest calendar blocks (maintenance, owner use).

## Done

- Drizzle migrations and the initial schema on the Neon `dev` branch (`fd79903`, `c994e01`).
