# TODO

Planned work. Decisions live in `docs/decisions/` (ADRs), known problems in `KNOWN_ISSUES.md`. Add new tasks at the bottom of "Next tasks"; move a task to "Done" with its commit when finished.

## Next tasks

Suggested order (the owner decides): 1. Subtasks 5 and 6 of the users task (users and roles screens; subtasks 1 to 4 and authentication are done), 2. `inquiry` status and the overlap constraint, 3. write endpoints and the New reservation screen, 4. ViewModels, 5. the production branch and the data migration, 6. the web app. Auth comes first because it gates every write endpoint and the point at which real data may be entered.

### Task: Users, roles and permissions (subtasks 1 to 4 and authentication done; start with 5)

**Brief and decisions:** `docs/briefs/users-roles-permissions.md` (approved 2026-11-08) and ADR 0007. Where the brief and an older doc disagree, the brief wins. Six subtasks; 1 to 4 first, 5 and 6 right after authentication.

1. **Migration: access tables and reference data.** `users`, `roles`, `permissions`, `role_permissions` (ADR 0004 conventions, `updated_at` triggers); seed the 5 roles, the 19 permissions and the role sets; one permission list in `packages/core` with a test that compares it to the database; `BEFORE DELETE` and `BEFORE TRUNCATE` triggers on every table; protected admin role and a trigger on `role_permissions`. Dev branch only.
2. **Script: create the first admin.** Run by the database owner, credentials entered at run time, never in the repo, dev-only guards; documented in `docs/database-migrations.md`.
3. **Migration: audit columns become foreign keys.** `dev-seed` system user, other values point at the first admin, `ALTER COLUMN ... TYPE ... USING` in place; update the seed guard; the seed ignores inactive rows. Depends on 2.
4. **API and screen: list of users.** `GET /api/users` with the role, never `password_hash`; a Users screen (fourth tab). Temporarily public (`KNOWN_ISSUES.md` 19). Built and pushed; since authentication it needs `can_view_user`.
5. **Create and edit users. DONE** (branch `feature/users-create-edit`; `POST /api/users/create` and `POST /api/users/edit`, `GET /api/roles`, `GET /api/users?id=`; the form behaviour is one `FormVM` in `packages/core` used by the Add user and the user details screens; password rules 10+ characters with upper, lower, digit and special). Admin only (`can_create_user`, `can_edit_user`); edit lets the admin set a new password (the forgotten-password flow), **and setting a new password or deactivating a user must also revoke that user's sessions** (call `revokeUserSessions` from `api/_sessions.js` in the same transaction; `updated_by` = the admin; ADR 0008); deactivating is an edit.
6. **Manage roles screen. DONE** (branch `feature/manage-roles`; new permissions `can_view_role` and `can_edit_role`, migration 0008, `GET /api/roles/permissions` and `POST /api/roles/edit`, the Roles tab and `app/role/[id].tsx` on a role form on the shared `FormVM`). Admin only; add or deactivate permissions on roles other than admin; admin's permissions shown read-only; the server answers 403 on any change to the admin role.

**Authentication (done, ADR 0008):** login, sessions, the deny-by-default guard, field filtering and the app screens, one commit each on `feature/authentication`.

**Authentication follow-ups:** (a) add `revokeUserSessions` / logout-all to the opt-in real-SQL test `scripts/sessions.dbtest.mjs` (today they are tested with the fake client only); (b) a device list and a per-device sign-out are not planned (ADR 0008, "No device list"); (c) revisit the login limits (5 / 30 per 15 minutes) after real use.

**Acceptance.** Migrations apply on `dev` only and never delete rows, drop tables or columns, or drop or disable triggers; no DELETE or TRUNCATE works for any role; the database and the code permission lists match (test); `/api/users` never contains a password hash; `npm run typecheck` and `npm test` pass.

### Task: Apartment details, edit mode

**Why.** The details screen is read-only (ADR 0006). Apartments must be editable in place.

**Behaviour (decided with the owner).**
- The details screen has one **Edit** button (only for a role with the permission to edit apartments). Pressing it turns the data **in place** into a form where individual fields can be changed. Fields the user may not edit are not shown as inputs, and finance or owner fields appear only with their own permission (for example `can_edit_apartment_rent`, `can_edit_apartment_owner_contact`).
- In edit mode there are two buttons. **Cancel** discards the changes and returns the screen to the state currently saved in the database (reload it from the server to be exact, so a change made by someone else meanwhile also shows). **Save** writes the form state to the database.
- Save is one request to an endpoint that checks the permission on the server, field by field, and validates like the schema does (phone format, area above 0, rent not negative, unique name). Errors show next to the field (for example a duplicate name, `23505`), and the form stays open on failure.
- Two people editing the same apartment: the save should notice that the record changed since it was loaded (compare `updated_at`) and say so instead of silently overwriting.
- `updated_by` and `updated_at` are set on save (the trigger keeps `updated_at` current). Deactivating an apartment follows ADR 0003 (`is_active`), not a delete.

**Depends on:** users, roles and permissions, and authentication (done).

**Where.** A `PATCH` endpoint in `api/` plus a guard from the auth task; form state and validation as a ViewModel in `packages/core` (pure `validateApartmentInput` next to `validateReservationInput`, with tests); the screen in `apps/mobile` stays thin. Show a clear saving state and a success message.

### Task: Write endpoints and the New reservation screen

**Why.** The app can only read. The old Airtable `api/reserve.js` was removed.

**Scope.** Create, edit and cancel a reservation on Postgres, with input validation (dates, phone format, amount) and clear 4xx messages; then the form screen from `CLAUDE.md` ("Form": apartment picker, date range picker, inline "Occupied" error from the server, success feedback, then reset). Map database errors as in `docs/database-migrations.md` (`23P01` overlap becomes 409 "Occupied" with the clashing reservation's guest and dates). Return the reservation `id` and `status` from the calendar so the app can open a stay.

**Depends on:** auth, the `inquiry` task and the overlap constraint (below). Reuse `findConflict` and `validateReservationInput` from `packages/core` for the client-side pre-check.

### Task: ViewModels and `react-bindings`

**Why.** `CLAUDE.md` wants all logic in Model and ViewModel. Today the temporary `hooks/useCalendarData.ts` and `state/ApartmentsProvider.tsx` hold loading, errors and the 60-second auto-refresh in the app.

**Scope.** `CalendarVM`, `ApartmentsVM` (and later `ReservationFormVM`, `AuthVM`) in `packages/core/viewmodels`, framework-agnostic with subscribe, unit-tested; thin hooks in a new `packages/react-bindings`. Keep the behaviour (auto-refresh on foreground and every 60 seconds, silent failures, request-id guard against stale responses).

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

- Apartment details: show the reservations of an apartment on its detail screen.
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
- Navigation (ADR 0006, `50b9e84`): bottom tabs (Home, Calendar, Apartments) and read-only apartment details, reached from the list and by tapping an apartment name in the calendar; `/api/apartments` returns the full details.
- The API reads only from Neon (`api/calendar.js`, `api/apartments.js`); all Airtable code and the old `api/reserve.js` are removed. Local API for the app: `npm run dev:api`.
