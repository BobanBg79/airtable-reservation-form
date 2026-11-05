# CLAUDE.md — Delta Reservations

Context handoff for Claude Code. Read this fully before writing code.

## What this is
Booking system for 15 rental apartments (Delta Apartmani, Serbia). Two people enter reservations, others only view. Must work great on phones.

## Current state (keep working until the rewrite replaces it)
- **Database:** Airtable base `Delta Rezervacije` (`appJVQJgv7iD74lR1`).
  - Table `Apartments` (`tbl28fxdzAJ9oYKsC`): `Name`, `Note`, `Reservations` (link).
  - Table `Reservations` (`tbl9OHuC2m4S8tT6Q`): `Guest`, `Apartment` (link to Apartments), `Check-in` (date), `Check-out` (date), `Phone`, `Status` (single select: `Potvrđeno`, `Avans`, `Otkazano` — to be renamed to `Active` / `Cancelled`), `Amount` (EUR), `Note`.
  - Apartments: Atlas, Berlin, Devetka, Egzotik, Eli, Kapiten, Karuzo, Luna, Margareta, Mimoza, Modena, Mona, Neva, Neven, Onyx.
  - Airtable automations flag overlaps in `Note` as `⚠ CONFLICT` (backup only).
- **Hosting:** Vercel project `airtable-reservation-form`, team `boban2`, Hobby plan. Env vars: `AIRTABLE_TOKEN`, `AIRTABLE_BASE`. Auto-deploys from `main`.
- **Existing files:**
  - `api/apartments.js` — GET list of apartments.
  - `api/reserve.js` — POST booking; rejects overlaps with 409 before saving.
  - `api/calendar.js` — GET `?month=YYYY-MM`, apartments + non-cancelled reservations in month.
  - `index.html` — plain booking form. `calendar.html` — plain monthly grid (scrolling / frozen header+column broken on mobile).

## Business rules (must hold in every client)
- Overlap = same apartment AND `newCheckIn < existingCheckOut` AND `newCheckOut > existingCheckIn`.
- Same-day changeover allowed (one leaves, next arrives same day).
- Cancelled bookings never block dates.
- Check-out must be after check-in. Guest, apartment, check-in, check-out required.
- The server (`api/reserve.js`) is the source of truth for overlap; clients may pre-check for UX but never skip the server check.
- Airtable token never reaches a client. Clients only call our `/api/*` endpoints.

## Target architecture: MVVM monorepo
Goal: all logic in Model + ViewModel, so the two Views are thin and developed independently.

```
packages/
  core/            # TypeScript, NO React, NO UI
    models/        # types: Apartment, Reservation; date + overlap utils
    services/      # api client for /api/* (fetch, base URL configurable)
    viewmodels/    # framework-agnostic: CalendarVM, ReservationFormVM
                   # (state + commands + validation, observable/subscribe)
  react-bindings/  # thin hooks: useCalendarVM, useReservationFormVM
apps/
  mobile/          # React Native (Expo) — PRIORITY
  web/             # React + React Router (Vite)
api/               # Vercel serverless functions (keep, convert to TS later)
```

Rules:
- `core` must be pure TypeScript, unit-tested (Vitest), no imports from React/RN.
- Views contain no business logic: they render VM state and call VM commands.
- Use npm or pnpm workspaces.

## Views
- **Mobile (do first):** Expo + React Native Paper (Material Design 3). Screens: Calendar (month), New reservation, Reservation details.
- **Web (later):** React + React Router + MUI (Material Design).
- **Calendar must:** scroll both directions, freeze the apartment column and the day header row, show today, weekends shaded, bookings as bars with guest name, prev/next month.
- Form: apartment picker, date range picker, inline "Occupied" error from server 409.

## Working style
- Owner: Slobodan, senior frontend dev (Vue/TS daily, knows React). Prefers short answers and numbered step-by-step instructions, one step at a time.
- All names, labels and UI text in English.
- Don't break the live `index.html` / `api/*` until the new apps replace them.

## First tasks
1. Set up workspaces + `packages/core` with models, overlap util and tests.
2. `ReservationFormVM` and `CalendarVM` with tests.
3. Expo app with Calendar screen using the calendar API.
4. New reservation screen.
