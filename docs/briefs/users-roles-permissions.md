# Brief for Claude Code: users, roles and permissions

Approved by the owner on 2026-11-08.

**Before reading this brief:** read the current documentation first: `CLAUDE.md`, `TODO.md`, `KNOWN_ISSUES.md`, `docs/database-migrations.md` and every ADR in `docs/decisions/`. Where this brief and an older doc disagree, this brief wins, and the older doc is updated to match.

## How Claude Code works on this

- At the start, show the owner the full list of tasks and subtasks as a checklist.
- After each one is finished, show the list again with that item ticked, so the owner always sees what is done and what comes next.

## Decisions

- **Credentials:** email + password. The email is the username (unique, stored lowercase). **No mail service for now.** Passwords are stored only as a slow salted hash (argon2 or bcrypt). The password hash is **never returned to any client**, admin included; it is only checked on the server at login.
- **Roles (five):** `admin`, `business_owner`, `manager`, `cleaning_lady`, `handyman`. One role per user (`users.role_id`).
- **Permissions:** `can_<action>_<entity>` or `can_<action>_<entity>_<sub_entity>`. Actions are only `view`, `create` and `edit`. Cancelling and deactivating are status changes, so they are `edit`. There is no delete.
- **Entities with permissions now:** `apartment`, `reservation`, `guest`, `cleaning`, `user`. Sub-entities: `apartment_owner_contact`, `apartment_rent`.
- **Permissions are defined even for entities that have no table yet** (`guest`, `cleaning`). Do not create those tables in this task.
- **Guest contact data** is part of `guest`, not a sub-entity.
- **No `reservation_amount` sub-entity.** Changing the amount or anything else on a reservation needs `can_edit_reservation`.
- **Cleaning** (future table): linked to an apartment and to a reservation, with a type: at checkout or during the stay.
- **Repairs:** out of scope for now, no permissions yet.
- **Admin:** has every permission; only admin manages users and other roles' permissions; nobody can change the admin role's own permissions. Changing role permissions is a hard rule, not a permission. `can_manage_users` does not exist; it is replaced by the three `user` permissions.
- **Passwords:** the password the admin sets when creating a user stays as it is; no forced change after the first login (no `must_change_password` column). Forgotten password: the admin sets a new password through edit user.

## Permissions (initial list, 19)

| Entity | view | create | edit |
| --- | --- | --- | --- |
| apartment | `can_view_apartment` | `can_create_apartment` | `can_edit_apartment` |
| reservation | `can_view_reservation` | `can_create_reservation` | `can_edit_reservation` |
| guest | `can_view_guest` | `can_create_guest` | `can_edit_guest` |
| cleaning | `can_view_cleaning` | `can_create_cleaning` | `can_edit_cleaning` |
| user | `can_view_user` | `can_create_user` | `can_edit_user` |
| apartment_owner_contact | `can_view_apartment_owner_contact` | | `can_edit_apartment_owner_contact` |
| apartment_rent | `can_view_apartment_rent` | | `can_edit_apartment_rent` |

Sub-entities have no `create`: they are created together with their entity.

### Initial role permissions (seeded by the migration)

| Role | Permissions |
| --- | --- |
| admin | all 19 |
| business_owner | all except `can_view_user`, `can_create_user`, `can_edit_user` (16) |
| manager | same as business_owner for now (16) |
| cleaning_lady | none for now |
| handyman | none for now |

## Task: users and the first admin

One task with six subtasks. Subtasks 1 to 4 come first; 5 and 6 need authentication and are done right after the authentication task.

### 1. Migration: access tables and reference data

- Tables `users`, `roles`, `permissions`, `role_permissions`, following ADR 0004 (snake_case, bigint identity id, `is_active`, `created_at`, `updated_at`, `created_by`, `updated_by`), each with its `updated_at` trigger.
- `users` columns: `id`, `email` (unique, lowercase, validated), `password_hash`, `first_name`, `last_name`, `phone` (optional), `role_id`, `is_active`, `last_login_at`, plus the four audit columns.
- Seed by migration (reference data, not the dev seed): the five roles, the 19 permissions, and the role sets above. The permission list lives in one place in code (`packages/core`), the migration inserts exactly those names, and a test fails if the database and the code list differ. Every later migration that adds a permission also grants it to admin.
- Generate with Drizzle, apply on the Neon `dev` branch only.

### 2. Script: create the first admin

- A one-off script run by the database owner that creates the project owner as admin.
- Credentials are entered at run time and never go into Git or any file in the repo.
- Same guards as the existing seed (dev branch only until the production branch exists).
- Document how to run it in `docs/database-migrations.md`.

### 3. Migration: audit columns become foreign keys

- `created_by` and `updated_by` are text today. Add a `dev-seed` system user for the seed rows and point the other existing values at the first admin, then convert the columns to foreign keys to `users` **in place** (`ALTER COLUMN ... TYPE ... USING`), never by adding a new column and dropping the old one.
- Update the seed guard (it checks `created_by = 'dev-seed'`) to match.
- Depends on subtask 2.

### 4. API and screen: list of users

- `GET /api/users` returns the users with their role. It never returns `password_hash`.
- A new Users screen in the app with the list.
- **Temporarily public**, with no auth yet. It will be moved behind admin in the authentication task. Log this in `KNOWN_ISSUES.md` next to the public owner-data issue.

### 5. Create and edit users (after authentication)

- Admin only (`can_create_user`, `can_edit_user`): endpoints and a screen to add a user (email, name, phone, role, password) and edit one.
- Edit user lets the admin set a new password; this is the forgotten-password flow. The password is hashed on the server and never returned.
- Deactivating a user is an edit (`is_active`), never a delete.

### 6. Manage roles screen (after authentication)

- A protected route visible only to admin that lists the roles and, for each role, its permissions.
- On any role other than admin, the admin can add a permission or deactivate it (`role_permissions.is_active`, never a delete).
- On the admin role, the permissions are shown as connected but are read-only: no add, remove or deactivate controls.
- The server enforces the same rule (403 on any change to the admin role), and the database trigger stays as the last line of defence.

## Next task: authentication

After subtasks 1 to 4: a login endpoint (password hash check), sessions (SecureStore on mobile, httpOnly cookie on web), the deny-by-default server guard (401 / 403), and public versus protected routes in the app, with the Users screen admin-only. Then subtasks 5 and 6. Field-level filtering and permission-based screens follow.

## Delete protection (owner decision)

- **Nothing is ever deleted**, including role permissions and users. `delta_app` keeps having no `DELETE` (ADR 0002). Removing a permission from a role sets `is_active = false`.
- **Triggers on every table, `users` included:** a `BEFORE DELETE` trigger and a `BEFORE TRUNCATE` trigger (TRUNCATE skips delete triggers) that raise an error for any role, `neondb_owner` included.
- **Admin protection:** a protected flag on the admin role and a trigger on `role_permissions` that refuses deactivating any admin row.
- **No automatic migration check.** The owner never writes migrations; Claude Code does. Add to `CLAUDE.md`: migrations never delete rows from any table, never drop a table or column, and never drop or disable a trigger. Migrations run only with `npm run db:migrate`.
- **Dev reset:** the triggers block the `TRUNCATE` reset described in `docs/database-migrations.md`. Replace it: when the seed data ages, one `UPDATE` sets the old seed reservations to `is_active = false`, then the seed runs with the new `SEED_BASE_DATE`. Apartments are only updated in place if needed; users stay. No new branch, nothing deleted. The seed's idempotency and overlap logic must ignore inactive rows.

## Documentation to produce

- **New ADR 0007:** the access model (roles, permission naming, entities without tables, admin rules, email + password without a mail service, delete protection).
- **`TODO.md`:** replace the current auth task with the users task (six subtasks), then the authentication task.
- **`KNOWN_ISSUES.md`:** the temporarily public users endpoint.
- **`docs/database-migrations.md`:** the first-admin script, the `dev-seed` system user, the new dev reset.
- **`CLAUDE.md`:** the migration rule, the auth and permission model in short, the new screens.
- **ADR 0002:** delete-blocking triggers apply to `neondb_owner` too.
- **ADR 0003:** nothing is ever deleted, `role_permissions` and `users` included.
- **ADR 0004:** the new tables, and `created_by` and `updated_by` now foreign keys to `users`.
- **ADR 0006:** the new Users and Manage roles screens and their routes.

Search all docs, the skills in `.claude/` and `CLAUDE.md` for any dev reset by `TRUNCATE` or by a new Neon branch, and replace it with the deactivate-and-reseed procedure.

## Notes from the existing docs

- **Guests:** ADRs 0001 and 0003 planned a `guests` table and ADR 0004 dropped it. ADR 0007 records that guest permissions exist now and the table comes later.
- **Production:** permissions arrive by migration, and production has no safe migration path yet (ADR 0004, question 1). Fine for dev, a blocker for production.
- **Later:** the append-only audit log (ADR 0002) can record permission changes.
