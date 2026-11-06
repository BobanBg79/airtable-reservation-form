# ADR 0001: Database choice — PostgreSQL on Neon

**Status:** Proposed
**Date:** 2026-11-06
**Project:** airtable-reservation-form

## Context

The project started on Airtable mainly because of its timeline view. We are now building our own app (React / React Native, MVVM) with a multi-calendar view, so Airtable's visual features are no longer the reason to keep it.

Requirements for the data layer:

- Separate dev and production databases
- Automated, scheduled backups and reliable recovery if something fails
- Optional replicas / failover
- Scalable, but low cost and easy to maintain
- Easy integration with Vercel
- Strong protection against duplicates and overlapping bookings
- Strict access control, including protection against our own accidental changes

## Why not Airtable

Airtable is a proprietary relational spreadsheet-database, neither true SQL nor NoSQL.

- No real environments — dev/prod means manually duplicating a base
- Backups are limited to built-in snapshots; scheduled backups require a custom export script against a rate-limited API
- No control over replicas or failover
- Limited database-level constraints

## SQL vs NoSQL

Reservation data is strongly relational: apartments, guests, reservations, payments, with clear relations and date-range rules. SQL fits better than NoSQL here. NoSQL's flexibility brings no real benefit, while SQL gives us constraints, transactions and reliable reporting.

## Decision

Use **PostgreSQL**, hosted on **Neon**.

Reasons for Neon over Supabase:

- Branching gives a dev database alongside prod at almost no cost
- Usage-based pricing with no fixed fee; suspends after inactivity, so low traffic stays cheap
- Native Vercel integration
- The database sits behind our Vercel backend rather than being exposed directly to the browser

Supabase remains a valid alternative if we later want built-in auth and realtime.

## Data size and archiving

Expected volume is small (tens of thousands of rows over many years). Postgres handles millions of rows with proper indexes, so one active database is sufficient and no deletion is needed for performance.

Optional later: partition reservations by year, or a yearly job moving records older than one year into an archive table or export.

## Integrity rules

- **Unique constraints** to prevent duplicate guests and transactions
- **Exclusion constraint** on (apartment, date range) to prevent overlapping bookings at the database level

## Access control

Three Postgres roles:

- **read_only** — SELECT only; used for everyday viewing
- **app** — used by the Vercel backend; INSERT and UPDATE, no DELETE, no schema changes
- **owner/admin** — used rarely, only for schema changes and migrations

Plus an **audit log** table recording who changed what and when.

## Backup and recovery

- Rely on Neon's point-in-time recovery as the primary safety net
- Add a scheduled cron job (e.g. nightly pg_dump) to external storage as an independent backup
- Periodically test restoring a backup into a dev branch

## Known risks

- Neon free projects inactive for 90+ days may be deleted (from 5 Oct 2026) — move to a paid plan or keep the project active before going live
- Pricing and limits change; recheck before launch

## Consequences

- Migrate existing Airtable data into Postgres
- Define schema and migrations in the repo
- Airtable can be retired once the app's calendar view is live
