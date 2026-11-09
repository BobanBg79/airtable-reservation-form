# ADR 0007: Access model (users, roles, permissions) and delete protection

**Status:** Accepted, approved by the owner on 2026-11-08
**Date:** 2026-11-08
**Project:** airtable-reservation-form
**Depends on:** [ADR 0002](0002-postgres-roles.md), [ADR 0003](0003-soft-delete.md), [ADR 0004](0004-initial-schema.md)
**Brief:** [`docs/briefs/users-roles-permissions.md`](../briefs/users-roles-permissions.md)

## Context

There is no authentication: anyone with the link can read everything the API serves (`KNOWN_ISSUES.md` 17), and the write endpoints that come next must be restricted. Different people need different access: the owner, business owners, managers who enter reservations, and later cleaning and maintenance staff.

## Decision

**Role-based access control.** A user has one role (`users.role_id`); permissions are attached to roles (`role_permissions`). The API checks permissions, never role names.

- **Tables:** `users`, `roles`, `permissions`, `role_permissions`, following ADR 0004. A `user_roles` join table is the later step if one role per user stops being enough.
- **Credentials:** email + password. The email is the username (unique, stored lowercase). **No mail service for now.** Passwords are stored only as a slow salted hash (argon2 or bcrypt); the hash is never returned to any client, admin included. The password the admin sets when creating a user stays as it is (no forced change). A forgotten password is fixed by the admin setting a new one through edit user. **Password rules** (owner, 2026-11-09): at least 10 characters (at most 72 bytes, a bcrypt limit) with an uppercase letter, a lowercase letter, a digit and a special character (anything that is not a letter, a digit or whitespace, such as `!`); the server checks them (`api/_password.js`) and `packages/core` has the same rules for the forms, kept in step by a parity test. **The admin's own account:** the admin cannot deactivate their own account and cannot change their own role (the server answers 403), so there is always an active admin; an admin may create other admins and may deactivate or re-role another admin. The email never changes after creation.
- **Roles (five):** `admin`, `business_owner`, `manager`, `cleaning_lady`, `handyman`. `editor` and `viewer` are dropped.
- **Permission names:** `can_<action>_<entity>` or `can_<action>_<entity>_<sub_entity>`. Actions are only `view`, `create` and `edit`. Cancelling and deactivating are status changes, so they are `edit`. There is no delete action.
- **Entities:** `apartment`, `reservation`, `guest`, `cleaning`, `user`. **Sub-entities:** `apartment_owner_contact` and `apartment_rent` (view and edit only; they are created together with their entity). Guest contact data is part of `guest`. There is no `reservation_amount` sub-entity: changing the amount needs `can_edit_reservation`.
- **19 permissions** in total (the full table is in the brief). The list lives in one place in code (`packages/core`); the migration inserts exactly those names, and a test fails if the database and the code differ.
- **Entities without a table:** permissions for `guest` and `cleaning` exist now, although those tables do not. ADRs 0001 and 0003 planned a `guests` table and ADR 0004 dropped it; the table comes later, and guest permissions are ready for it. A future `cleaning` row is linked to an apartment and to a reservation, with a type (at check-out or during the stay). Repairs are out of scope.
- **Initial sets (seeded by the migration):** admin has all 19; `business_owner` and `manager` have all except the three `user` permissions (16); `cleaning_lady` and `handyman` have none for now. Every later migration that adds a permission also grants it to admin.
- **Admin rules:** admin has every permission; only admin manages users and the permissions of other roles; nobody can change the admin role's own permissions. Changing role permissions is a hard rule (the caller is admin and the target role is not admin), not a permission. `can_manage_users` does not exist; the three `user` permissions replace it.
- **Server guard:** deny by default, 401 when not signed in, 403 when the permission is missing; the server leaves out the fields a caller may not see. This is built in the authentication task.

## Delete protection

Nothing is ever deleted, including role permissions and users.

- `delta_app` keeps having no `DELETE` (ADR 0002). Removing a permission from a role sets `role_permissions.is_active = false`; deactivating a user sets `users.is_active = false`.
- **Triggers on every table, `users` included:** a `BEFORE DELETE` trigger and a `BEFORE TRUNCATE` trigger (TRUNCATE skips delete triggers) raise an error for any role, `neondb_owner` included.
- **Admin protection:** a protected flag on the admin role, and a trigger on `role_permissions` that refuses deactivating any admin row.
- **Migrations** never delete rows, never drop a table or column, and never drop or disable a trigger. They run only with `npm run db:migrate`. There is no automatic check; Claude Code writes the migrations and follows this rule (`CLAUDE.md`).
- **Dev reset** no longer uses `TRUNCATE`: see `docs/database-migrations.md` (deactivate the old seed reservations, then seed with a new `SEED_BASE_DATE`).

## Audit columns

`created_by` and `updated_by` become foreign keys to `users`, converted in place. A `dev-seed` system user owns the seed rows; other existing values point at the first admin.

## Consequences

- A database-level `DELETE` or `TRUNCATE` is impossible for the owner as well. A genuine erasure request (ADR 0003) would need a deliberate migration that changes the rule, which is a decision for the owner.
- Seed logic and any "is this row taken" checks must ignore inactive rows.
- Without a mail service, the admin sets and resets all passwords by hand and passes them on out of band.
- **Production:** permissions arrive by migration and production has no safe migration path yet (ADR 0004, open question 1). Fine for dev, a blocker for production.
- **Later:** the append-only audit log (ADR 0002) can record permission changes.

## Open questions

- The password hash algorithm (argon2 or bcrypt), decided in the authentication task.
- Rate limiting of logins, also in the authentication task.
