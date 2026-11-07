# ADR 0003: Deactivate instead of delete (soft delete)

**Status:** Proposed
**Date:** 2026-11-07
**Project:** airtable-reservation-form
**Depends on:** [ADR 0001](0001-database.md), [ADR 0002](0002-postgres-roles.md)

## Context

The app role `delta_app` has no `DELETE` privilege (ADR 0002), but features such as "remove an apartment" will be needed. Rows are referenced by foreign keys: reservations point to apartments and guests. A real `DELETE` would either be refused by the database, or, with `ON DELETE CASCADE`, wipe the booking history and revenue records with it.

## Decision

Entities are **deactivated**, not deleted. The app never needs `DELETE`, and `delta_app` keeps not having it.

- **Apartments and guests** get an archive marker. Deactivating is an `UPDATE`, which `delta_app` is allowed to do, and it is reversible with another `UPDATE`.
- **Reservations** already work this way through their status: `Cancelled` and `No show` free the dates, `Active` and `Inquiry` block them (see `api/_status.js`).
- A **real `DELETE` is done only by `neondb_owner`**, as an exception: a data-entry mistake, or a request to erase a guest's personal data. For the latter, prefer **anonymizing** the guest (clear name and phone, keep the row) over deleting it, so reservations and amounts stay intact.

## Why

- History stays complete: past reservations and amounts keep pointing at an apartment or guest that exists.
- No orphans: nothing disappears, so no foreign key points at nothing.
- Reversible: a deactivated apartment comes back with one `UPDATE`.
- The audit log can show who deactivated what and when.

## Rules for the schema design

1. **Marker:** a nullable `archived_at timestamptz` column on `apartments` and `guests` (null means active). It records when, not just whether. (A boolean `is_active` is the simpler alternative; see open questions.)
2. **Unique keys are scoped to active rows** with partial unique indexes, for example `UNIQUE (name) WHERE archived_at IS NULL` for apartments and the same for the normalized guest phone, so a name or number can be reused after the old one is archived.
3. **The overlap exclusion constraint** stays on reservations with a blocking status only (`Active`, `Inquiry`), as in ADR 0001.
4. **Reads filter active rows by default.** Lists, pickers and the calendar exclude archived apartments and guests; history views may include them.
5. **New bookings** cannot be made for an archived apartment or guest (checked by the app, and by the database where it can express it).
6. **Foreign keys keep the default `ON DELETE NO ACTION`/`RESTRICT`**, never `CASCADE`, so an accidental owner-side `DELETE` of a referenced row is refused.

## Consequences

- Every listing query needs the `archived_at IS NULL` filter; wrap it in one place (a view or a repository function) so it cannot be forgotten.
- Tables grow slowly with archived rows; at our volume (ADR 0001) this is irrelevant.
- Erasure requests need a documented owner-side procedure (anonymize first, hard delete only if required).

## Open questions

- `archived_at` timestamp (recommended) or boolean `is_active`?
- Do guests ever need to be archived, or only anonymized on request?
- Should the read-only role see archived rows by default?
