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
- Usage-based pricing with no fixed fee; scale-to-zero after inactivity, so low traffic stays cheap
- Native Vercel integration
- The database sits behind our Vercel backend rather than being exposed directly to the browser

Supabase remains a valid alternative if we later want built-in auth and realtime.

## Data model note: guests

Introduce a separate **guests** table (currently `Guest` and `Phone` are free text on the reservation). Phone number (normalized) is the unique key. Reservations reference a guest. This enables guest history and prevents duplicate guest records.

## Data size and archiving

Expected volume is small (tens of thousands of rows over many years). Postgres handles millions of rows with proper indexes, so one active database is sufficient and no deletion is needed for performance.

Optional later: partition reservations by year, or a yearly job moving records older than one year into an archive table or export.

## Integrity rules

- **Unique constraints** to prevent duplicate guests (normalized phone) and duplicate transactions
- **Exclusion constraint** on (apartment, date range) to prevent overlapping bookings at the database level:
  - requires the `btree_gist` extension
  - date range is half-open `[)`, so a check-out and a new check-in on the same day are allowed
  - applies only to blocking statuses (`Active`, `Inquiry`); `Cancelled` and `No show` free the dates, matching current logic in `api/_status.js`
- Because the database rejects overlaps (including concurrent requests), the planned "write then verify" edit endpoint is not needed

## Access control

Three Postgres roles:

- **read_only** — SELECT only; used for everyday viewing
- **app** — used by the Vercel backend; INSERT and UPDATE, no DELETE, no schema changes
- **owner/admin** — used rarely, only for schema changes and migrations

Plus an **audit log** table recording who changed what and when.

## Backup and recovery

- Rely on Neon's point-in-time recovery as the primary safety net (history window on the Free plan is limited)
- Add a scheduled cron job (e.g. nightly pg_dump) to external storage as an independent backup
- Periodically test restoring a backup into a dev branch

## Neon Free plan facts (checked 2026-11-06)

- Permanent free tier, not a trial
- 0.5 GB storage per project, 100 CU-hours per project per month, 10 branches per project
- Scale-to-zero after 5 minutes of inactivity; first request after that resumes in a few hundred milliseconds (minor cold-start latency)
- Inactive branches may be archived automatically; they are restored on access
- No confirmed policy of deleting inactive Free projects was found in Neon's docs (an earlier claim of 90-day deletion was unverified and is withdrawn)

## Known risks

- Pricing and limits change; recheck against Neon's pricing page before launch
- Consider a paid plan before production for a longer recovery window

## Consequences

- Do not build edit/cancel features on top of Airtable; implement them only on Postgres. Items 2, 3 and 4 in KNOWN_ISSUES.md and automation A become obsolete
- Migrate existing Airtable data into Postgres (including deduplicating guests)
- Define schema and migrations in the repo
- Airtable can be retired once the app's calendar view is live
