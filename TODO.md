# TODO

Planned work. Decisions live in `docs/decisions/` (ADRs), known problems in `KNOWN_ISSUES.md`. Add new tasks at the bottom of "Next tasks"; move a task to "Done" with its commit when finished.

## Next tasks

Suggested order (the owner decides): 1. Auth, 2. `inquiry` status and the overlap constraint, 3. write endpoints and the New reservation screen, 4. ViewModels, 5. the production branch and the data migration, 6. the web app. Auth comes first because it gates every write endpoint and the point at which real data may be entered.

### Task: Authentication, users, roles and permissions (start here tomorrow)

**Why.** There is no auth. Anyone who knows the URL can read everything the API serves, including owner contact data (`KNOWN_ISSUES.md` 17), and the write endpoints that come next must be restricted by role (managers and above). This also gives the Home screen its signed-in user.

**First step: propose the approach to the owner before writing code** (`CLAUDE.md`, "Auth"). Credentials are email based (see below). Session token in Expo SecureStore on mobile and an httpOnly cookie on web; every write endpoint checks the permission on the server. The owner picks between the options once they are laid out.

**Access model (decided with the owner): users, roles and permissions.** A user gets a role, and permissions are attached to roles (role-based access control). Nothing is checked against a hard-coded person or role name in the code: the API asks for a permission.

- **Tables**, following the conventions of ADR 0004 (snake_case, bigint identity id, `is_active`, timestamps, `created_by` and `updated_by`): `users`, `roles`, `permissions`, and `role_permissions` (many to many: which permissions a role has). **One role per user for now** (`users.role_id`); a `user_roles` join table is the later step if that ever changes. `users.email` is the login: unique, stored lowercase, validated.
- **Permission names are `can_<action>_<entity>`, or `can_<action>_<entity>_<sub_entity>` for a part of an entity.** A sub-entity is a slice of an entity with its own permission, for example the owner's contact details of an apartment: `can_view_apartment_owner_contact`. Examples: `can_view_reservation`, `can_create_reservation`, `can_edit_reservation`, `can_cancel_reservation`, `can_view_apartment`, `can_edit_apartment`, `can_view_apartment_owner_contact`, `can_view_apartment_rent`, `can_view_reservation_amount`, `can_manage_users`. The exact list is written when the task starts. Plan the sub-entities from the start: the data model and the API responses need to be able to leave a slice out.
- **Roles, from most to least permissions: `admin`, then `business_owner`, then `manager`. `editor` and `viewer` are dropped.** The sets are seeded as a hierarchy: admin has everything, business_owner has a subset of that, and manager a subset of business_owner's. **Owner data and finance data is for business_owner (and admin) only**: owner contact (`can_view_apartment_owner_contact`), rent (`can_view_apartment_rent`) and similar. A manager does not get these. **A manager can see reservation amounts** (`can_view_reservation_amount`); viewing and editing a sub-entity are separate permissions (`can_edit_reservation_amount`, `can_edit_apartment_rent`, ...), and a role can have one without the other.
- **The admin role has every permission from the start.** Those `role_permissions` rows are seeded, and every later migration that adds a permission also grants it to admin.
- **Only admin can add or remove permissions on roles, and never on itself.** The admin role's own permissions are fixed: no one, not even an admin, can add or remove them. Managing role permissions is a hard rule (the caller is an admin and the target role is not admin), not a permission that can be granted to another role. Enforce it in the API and, where possible, in the database (for example a protected flag on the admin role and a trigger on `role_permissions`).
- **Seed (reference data, created by a migration, not by the dev seed):** the roles, all permissions, the admin's permissions, and the initial sets for `business_owner` and `manager` (which admin can adjust afterwards). The first admin is the project owner, created once by a script the database owner runs, with credentials that never go into Git; the dev seed may add fake dev users, one per role.
- **Only admin manages users** (`can_manage_users` is admin only). The owner is the real admin and creates accounts when colleagues ask for them.
- **Credentials are email based.** The email address is the login and the unique key of a user, and it matters for issuing and resetting credentials. How the first password reaches the colleague is open (see below). Passwords are never stored in plain text (a slow salted hash such as argon2 or bcrypt), logins are rate limited, and sending email needs a mail service (to be chosen; the Vercel Hobby plan has none built in).
- **Server guard (permissions protect the data, not just the screens).** One central guard in `api/`, for example `requirePermission('can_create_reservation')`, resolves the user from the session and checks the permission before any handler code runs. It is **deny by default**: an endpoint without a declared permission is refused, and a test fails if a route in `api/` has no guard (public routes, such as login, are listed explicitly). Unauthenticated is 401, missing permission is 403. Some permissions also decide **which fields** a response contains: the server leaves out what the caller may not see (for example the owner's name, phone and rent from `/api/apartments` without `can_view_apartment_owner_contact`), instead of sending it and hoping the app hides it. Cover every endpoint and role with tests (a role and endpoint matrix).
- **Apps: screens and actions depend on permissions.** After login the app receives the user, the role and the list of permission names. Some screens are not visible at all to some roles: a tab appears only if the user has the permission for that screen (for example Calendar needs `can_view_reservation`, Apartments needs `can_view_apartment`), and a section such as the owner block on the apartment details appears only with its own permission. Opening a hidden screen by link or a stale route shows a clear "no access" screen or goes back, never an empty or broken one. This is for the user experience only; the server guard above is what protects the data. `packages/core` holds the types and a pure `can(permissions, name)` with tests, and the tab bar and routes read from it. **Finance fields can be absent** in a response for a role without the permission, so in `packages/core` the rent and owner fields of `ApartmentDetails` (and the reservation amounts) become optional, and the screens handle their absence: the rent column of the apartments list and the rent tile on the details, and the whole owner section, simply do not appear for a manager.
- `created_by` and `updated_by` (text now, ADR 0004) become foreign keys to `users`.

**Decided:** `editor` and `viewer` are dropped; a manager sees reservation amounts; viewing and editing are separate permissions; `can_manage_users` is admin only; the owner is the first admin and creates the accounts. **Still to decide.** (1) Does creating a reservation need `can_edit_reservation_amount`, because the schema makes `total_amount_eur` required? (Suggested: yes, and a manager has it.) (2) Are the permission sets strictly nested, and does anything enforce it, or is it only how the seed is written? (3) The login flow: an email and password where the admin sets a first password that must be changed, or a link or one-time code sent by email so no password travels between people? Which mail service? (4) What a lost device or a forgotten password looks like. (5) Whether `business_owner` may edit apartments or only view finance data.

**Acceptance criteria.** Unauthenticated requests get 401 on everything except a login endpoint; a manager gets 403 on anything that needs a permission the role lacks; permissions are read from the role (changing a role's permissions changes what its users can do without a code change); a manager and a business_owner cannot change any role's permissions and an admin cannot change the admin role's permissions (403); the admin role has every permission after the seed and after every migration that adds one; the app shows a login screen and keeps the session; tests for the role checks in `api/`. Every endpoint has a declared permission, and a test fails when one does not. A role without `can_view_apartment_owner_contact` receives no owner fields in the response (not merely hidden in the app). A role without the permission for a screen does not see its tab, and a direct link to it shows a no-access screen.

### Task: Apartment details, edit mode

**Why.** The details screen is read-only (ADR 0006). Apartments must be editable in place.

**Behaviour (decided with the owner).**
- The details screen has one **Edit** button (only for a role with the permission to edit apartments). Pressing it turns the data **in place** into a form where individual fields can be changed. Fields the user may not edit are not shown as inputs, and finance or owner fields appear only with their own permission (for example `can_edit_apartment_rent`, `can_edit_apartment_owner_contact`).
- In edit mode there are two buttons. **Cancel** discards the changes and returns the screen to the state currently saved in the database (reload it from the server to be exact, so a change made by someone else meanwhile also shows). **Save** writes the form state to the database.
- Save is one request to an endpoint that checks the permission on the server, field by field, and validates like the schema does (phone format, area above 0, rent not negative, unique name). Errors show next to the field (for example a duplicate name, `23505`), and the form stays open on failure.
- Two people editing the same apartment: the save should notice that the record changed since it was loaded (compare `updated_at`) and say so instead of silently overwriting.
- `updated_by` and `updated_at` are set on save (the trigger keeps `updated_at` current). Deactivating an apartment follows ADR 0003 (`is_active`), not a delete.

**Depends on:** authentication, users, roles and permissions (above).

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
