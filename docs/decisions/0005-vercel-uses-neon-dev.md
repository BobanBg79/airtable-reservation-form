# ADR 0005: Vercel uses the Neon `dev` branch for now

**Status:** Accepted (temporary), decided by the owner
**Date:** 2026-11-07
**Project:** airtable-reservation-form
**Depends on:** [ADR 0002](0002-postgres-roles.md), [ADR 0004](0004-initial-schema.md)

## Context

The API reads only from Neon. The Neon `production` branch has no schema, no roles and no data yet, and getting it ready (roles, a safe way to run migrations, the data migration, backups) is a larger piece of work. ADR 0002 says production credentials live only in Vercel's Production environment variables. Meanwhile the owner is the only user and wants the deployed API to work.

## Decision

Until the production branch is ready, **Vercel's Production environment connects to the Neon `dev` branch**, as the role `delta_app`.

- The only variable Vercel needs is **`DATABASE_URL`**: the pooled connection string of `delta_app` on `dev` (the same value as `DATABASE_URL` in the local `.env.local`).
- Vercel gets **nothing else** from the database setup: not `MIGRATION_DATABASE_URL` (the owner), not `READONLY_DATABASE_URL`, not `DATABASE_URL_UNPOOLED`, not `NEON_BRANCH`. `AIRTABLE_TOKEN` and `AIRTABLE_BASE` are no longer used and can be removed.
- Environment scope: Production only. Preview and Development deployments do not get it.
- Migrations are still applied only to `dev`, from this machine, as `neondb_owner` (`npm run db:migrate`).

## What this means

- **The deployed app shows the dev data** (three fake apartments and ten fake reservations from `npm run db:seed`). That is fine while the owner is the only user.
- **No real guest data may be entered while this is in place.** The `dev` branch is disposable.
- **`dev` is now shared by local work and the deployed API.** Re-seeding, resetting or wiping `dev` changes what the deployed app shows, and a schema migration applied to `dev` is live for the deployed API immediately: apply migrations that the deployed code does not understand only after (or together with) the code that needs them, and avoid breaking changes.
- **The dev safety guard does not run on Vercel** (`assertDevDatabaseSafe()` skips Vercel production on purpose), so nothing in the code checks the branch there. This ADR and the checklist below are the control.
- ADR 0002's rule that **production credentials never go into a local file** is unchanged. What changes is only that Vercel Production holds the `dev` credentials for now, which keeps the production branch untouched.

## Ending this decision (exit criteria)

Done when all of these are true; then switch Vercel's `DATABASE_URL` to the `production` branch and supersede this ADR:
1. The `production` branch has the roles of ADR 0002 with **new passwords** (not the dev ones), the schema applied, and the real data migrated.
2. A safe way to run migrations for production exists (ADR 0004, open question 1).
3. A backup has been taken and restored successfully (ADR 0001).
4. The `dev` credentials are removed from Vercel.

## Checklist

- [ ] `DATABASE_URL` (the `delta_app` pooled string of `dev`) added to Vercel Production.
- [ ] The Postgres version of the API is pushed to `main` and deployed (the owner approves the push).
- [ ] The production API answers with the dev data (`/api/calendar?month=YYYY-MM`).
- [ ] `AIRTABLE_TOKEN` and `AIRTABLE_BASE` removed from Vercel.
