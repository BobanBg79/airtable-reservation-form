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

### Task 2: no double booking, enforced by the database (exclusion constraint)

**Branch (suggested):** `feature/no-overlap-constraint`, together with or after the `inquiry` task.
**Related:** ADR 0001 ("Integrity rules"), ADR 0004, business rules in `CLAUDE.md`.

**Why.** Today nothing in the database stops two reservations of the same apartment from overlapping. A constraint in the table makes overlap impossible for every writer (the API, an edit, a status change, two simultaneous requests), so the database becomes the final source of truth and the planned write-then-verify endpoint is not needed.

**The rule (from `CLAUDE.md`).** Two reservations of the same apartment overlap when `newCheckIn < existingCheckOut AND newCheckOut > existingCheckIn`. A same-day changeover is allowed: one reservation's check-out may equal another's check-in. Check-out must stay after check-in (already a check constraint).

**Schema change (one hand-written migration).** Drizzle cannot model exclusion constraints, so use `npx drizzle-kit generate --custom --name=no_overlap_constraint`:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "apartment_id" WITH =,
    daterange("check_in_date", "check_out_date", '[)') WITH &&
  ) WHERE ("status" IN ('active', 'inquiry') AND "is_active");
```

- `btree_gist` lets a gist index compare the integer `apartment_id` with `=`.
- The half-open range `[check_in, check_out)` is what makes a same-day changeover legal.
- The `WHERE` makes only blocking rows count: `active` and `inquiry` block; `cancelled`, `no_show` and deactivated rows (`is_active = false`) free their dates and may overlap anything.
- The `inquiry` value must already exist in the enum, so do the `inquiry` task first. If this task goes first, the constraint can only list `active` and has to be dropped and recreated when `inquiry` is added.
- Creating the extension needs the owner role, which migrations use. Check that Neon allows it on the branch before relying on it.

**What it covers automatically.** The constraint is checked on every `INSERT` and `UPDATE`: new bookings, moving dates, changing the apartment, and reactivating a `cancelled` or `no_show` reservation. Two simultaneous requests cannot both succeed; one fails.

**API follow-up (when `api/*` moves to Postgres).** The failure is SQLSTATE `23P01` (`exclusion_violation`); map it to HTTP 409 "Occupied" and look up the conflicting reservation to show its guest and dates. The client may still pre-check overlap for UX (`findConflict` in `packages/core`), but the database decides. Add `23P01` to the error-code table in `docs/database-migrations.md`.

**Acceptance criteria (test on `dev` with temporary rows, then clean up).**
- Same apartment, overlapping dates: rejected with `23P01`.
- Same apartment, check-out equal to another reservation's check-in (and the reverse): allowed.
- Different apartment, same dates: allowed.
- A `cancelled`, `no_show` or `is_active = false` reservation does not block; a new reservation may take its dates.
- Reactivating such a reservation while its dates are taken: rejected; when free: allowed.
- Updating dates or apartment into an occupied range: rejected.
- An `inquiry` blocks like an `active` reservation (after the `inquiry` task).
- One-night stays work (`[d, d+1)`).
- Two parallel inserts for the same dates: exactly one succeeds.
- `delta_app` still cannot delete or run DDL; `npm run typecheck` and `npm test` pass.

**Open question.** Should the existing btree index `reservations_apartment_dates_idx` stay? The constraint creates its own gist index; keep the btree one only if calendar queries still benefit (check with `EXPLAIN` once there is data).

## Backlog

- Apartment details: edit (needs auth first), and the reservations of an apartment on its detail screen.
- Home: show the signed-in user once there is authentication.
- Write endpoints on Postgres: create, edit and cancel a reservation (replacing the removed `api/reserve.js`), with auth, input validation (dates, phone, amount) and error-code mapping (see `docs/database-migrations.md`). The calendar should also return the reservation `id` and `status`.
- Migrate the real Airtable data (15 apartments, existing reservations) into Postgres, one time. The Airtable base stays untouched as the fallback until a backup has been restored successfully.
- **Production branch (must be done before any real data is entered):** roles on the `production` branch with new passwords, the schema applied there, the data migrated, a safe way to run migrations for production (ADR 0004, open question 1), and `DATABASE_URL` in Vercel switched from the `dev` branch to production. Until then Vercel Production uses the `dev` branch (ADR 0005, `KNOWN_ISSUES.md` 16).
- Backups: scheduled `pg_dump` to external storage and a restore test into `dev` (ADR 0001).
- Clean up Vercel: remove `AIRTABLE_TOKEN` and `AIRTABLE_BASE` from the environment variables, and cancel or archive the Airtable base once the backup above is proven.
- Decide how to handle non-guest calendar blocks (maintenance, owner use).

## Done

- Drizzle migrations and the initial schema on the Neon `dev` branch (`fd79903`, `c994e01`).
- Dev seed: nine apartments (real names, made-up details) and 25 fake reservations around 2026-11-07 (`npm run db:seed`).
- Navigation: bottom tabs (Home, Calendar, Apartments) and read-only apartment details, reached from the list and by tapping an apartment name in the calendar; `/api/apartments` returns the full details.
- The API reads only from Neon (`api/calendar.js`, `api/apartments.js`); all Airtable code and the old `api/reserve.js` are removed. Local API for the app: `npm run dev:api`.
