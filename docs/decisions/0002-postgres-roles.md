# ADR 0002: Postgres roles and privileges

**Status:** Proposed
**Date:** 2026-11-06
**Project:** airtable-reservation-form
**Depends on:** [ADR 0001](0001-database.md) (PostgreSQL on Neon)

## Context

ADR 0001 asks for strict access control, including protection against our own accidental changes. This ADR records the three database roles, how they are provisioned on Neon, and how the connection strings are used.

Scope: the `dev` branch of the Neon project `Delta` (`damp-dream-71823503`, AWS Frankfurt, PostgreSQL 18). Production was not touched; it still has only `neondb_owner`. The same steps will be repeated for production before going live.

## Decision

| Role | Login | Used by | Can do |
|---|---|---|---|
| `neondb_owner` | yes | migrations and schema changes only, run by a human or a migration script | everything (owns the objects) |
| `delta_app` | yes | the Vercel backend (`api/*`) | `SELECT`, `INSERT`, `UPDATE` on all tables in `public`; `USAGE` on sequences |
| `delta_readonly` | yes | everyday viewing, reports, ad-hoc queries | `SELECT` on all tables in `public` |

Rules:

- `neondb_owner` is never used by the running app and is never put into Vercel.
- `delta_app` has no `DELETE`, no `TRUNCATE`, no `REFERENCES`/`TRIGGER`, and cannot run any DDL (no `CREATE`, `ALTER`, `DROP`, no temporary tables, no new schemas).
- Rows are never deleted by the app. A reservation is cancelled by changing its status (`Cancelled`, `No show`); corrections that truly need a delete are done by the owner.
- `delta_app` and `delta_readonly` both have `CONNECT` on the database and `USAGE` on schema `public`.

## How the roles were provisioned

1. Roles created with the Neon CLI, so Neon generates the passwords:
   `neon roles create --project-id damp-dream-71823503 --branch dev --name <role> --access read_only`
2. Privileges applied with SQL as `neondb_owner`:
   - `delta_app`: `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public`, `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public`, plus an explicit `REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER`.
   - `delta_readonly`: `GRANT SELECT ON ALL TABLES IN SCHEMA public`, plus an explicit `REVOKE` of every write privilege.
   - `ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public ...` so tables and sequences that `neondb_owner` creates later get the same grants automatically.
   - `REVOKE CREATE ON SCHEMA public FROM PUBLIC` and `REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC`, so nobody but the owner can create objects (PUBLIC has `TEMPORARY` on the database by default, which would let `delta_app` run `CREATE TEMP TABLE`).

### Neon specifics worth remembering

- **`neon roles create` defaults to `--access admin`**, which makes the role a member of `neon_superuser` (admin on every database, can read and write all data). Always pass `--access read_only` and add the extra grants with SQL. `--access read_write` would include `DELETE`.
- The roles are not members of `neon_superuser` and have no `CREATEROLE`, `CREATEDB` or `BYPASSRLS` (checked in `pg_roles` and `pg_auth_members`).
- Default privileges only cover objects created by `neondb_owner`. An object created by any other role would not get the grants.

## Connection strings (`.env.local`, git-ignored)

| Variable | Role | Pooled | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `delta_app` | yes | the running app (Vercel) |
| `DATABASE_URL_UNPOOLED` | `delta_app` | no | app code that needs a direct connection |
| `MIGRATION_DATABASE_URL` | `neondb_owner` | no | migration scripts only |
| `READONLY_DATABASE_URL` | `delta_readonly` | no | viewing and reports |

- Passwords are never printed, logged or committed. Vercel gets only `DATABASE_URL` (and `DATABASE_URL_UNPOOLED` if needed), never the owner or the read-only string.
- `neon deploy` and `neon env` pull their own variables into `.env.local` and can overwrite `DATABASE_URL` / `DATABASE_URL_UNPOOLED` with the owner's string. Re-check the file after running them.

## Verification (dev branch, 2026-11-06)

A temporary table was created by `neondb_owner` after the default privileges were set (so the default privileges were tested too), checked with each role, then dropped. All 17 checks passed:

| Role | Allowed | Denied (`42501 permission denied` / `must be owner`) |
|---|---|---|
| `delta_app` (direct and pooled) | `SELECT`, `INSERT` (uses the sequence), `UPDATE` | `DELETE`, `TRUNCATE`, `CREATE TABLE`, `CREATE TEMP TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE SCHEMA` |
| `delta_readonly` | `SELECT` | `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE` |

After cleanup, `public` had 0 tables. The production branch still has only `neondb_owner`.

## Consequences

- Migrations run with `MIGRATION_DATABASE_URL` and always as `neondb_owner`, so default privileges apply to everything they create. Tables created by hand with another role need explicit grants.
- The audit log table (next design step) should be append-only for the app: grant `INSERT` but revoke `UPDATE` on it from `delta_app`.
- The app cannot delete data, so "delete" features are modelled as status changes.
- Production needs the same roles created and verified before launch; use new passwords, not the dev ones.

## Open questions

- Should `delta_readonly` also be limited to specific tables or views (for example, hide guest phone numbers)?
- Passwords rotation schedule for `delta_app` (Neon can reset a role's password).
