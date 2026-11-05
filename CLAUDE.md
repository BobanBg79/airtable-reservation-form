# CLAUDE.md — Delta Reservations

Context handoff for Claude Code. Read this fully before writing code.

## Your role
You are a senior frontend engineer and an expert in React, React Native (Expo) and TypeScript, with a strong eye for UI/UX design. Build production-quality, clean, tested code and a genuinely beautiful interface.

## What this is
Booking system for 15 rental apartments (Delta Apartmani, Serbia). Two people enter reservations, others only view. Must work great on phones.

## Current state (keep working until the rewrite replaces it)
- **Database:** Airtable base `Delta Rezervacije` (`appJVQJgv7iD74lR1`).
  - Table `Apartments` (`tbl28fxdzAJ9oYKsC`): `Name`, `Note`, `Reservations` (link).
  - Table `Reservations` (`tbl9OHuC2m4S8tT6Q`): `Guest`, `Apartment` (link to Apartments), `Check-in` (date), `Check-out` (date), `Phone`, `Status` (single select: `Potvrđeno`, `Avans`, `Otkazano` — to be renamed to `Active` / `Cancelled`), `Amount` (EUR), `Note`.
  - Apartments: Atlas, Berlin, Devetka, Egzotik, Eli, Kapiten, Karuzo, Luna, Margareta, Mimoza, Modena, Mona, Neva, Neven, Onyx.
  - Airtable automations flag overlaps in `Note` as `⚠ CONFLICT` (backup only).
- **Hosting:** Vercel project `airtable-reservation-form`, team `boban2`, Hobby plan. Env vars: `AIRTABLE_TOKEN`, `AIRTABLE_BASE`. Auto-deploys from `main`. Production URL: https://airtable-reservation-form-boban2.vercel.app
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
- Time zone: `Europe/Belgrade`. Dates are date-only (`YYYY-MM-DD`), never shift them via UTC conversion.
- Currency: EUR.

## Auth (new requirement)
- Today anyone with the link can create bookings. Fix this.
- Two roles: **editor** (2 people: create/edit/cancel) and **viewer** (everyone else: read-only calendar).
- Keep it simple: e.g. PIN or magic-link login handled by Vercel functions, session token in secure storage (Expo SecureStore / httpOnly cookie on web). Every write endpoint checks the editor role server-side.
- Propose the approach before implementing.

## Target architecture: MVVM monorepo
Goal: all logic in Model + ViewModel, so the two Views are thin and developed independently.

```
packages/
  core/            # TypeScript, NO React, NO UI
    models/        # types: Apartment, Reservation; date + overlap utils
    services/      # api client for /api/* (fetch, base URL configurable)
    viewmodels/    # framework-agnostic: CalendarVM, ReservationFormVM, AuthVM
                   # (state + commands + validation, observable/subscribe)
  react-bindings/  # thin hooks: useCalendarVM, useReservationFormVM, useAuthVM
apps/
  mobile/          # React Native (Expo) — PRIORITY
  web/             # React + React Router (Vite)
api/               # Vercel serverless functions (keep, convert to TS later)
```

Rules:
- `core` must be pure TypeScript, unit-tested (Vitest), no imports from React/RN.
- Views contain no business logic: they render VM state and call VM commands.
- Use npm or pnpm workspaces.

## Design
- Material Design 3. Mobile: React Native Paper. Web: MUI.
- Look: modern, calm, premium hospitality feel. Generous spacing, rounded cards, clear typography, one strong accent colour, light + dark mode.
- Each apartment gets its own consistent colour for booking bars.
- Smooth, subtle animations; large touch targets; works one-handed.
- **Calendar must:** scroll both directions smoothly, freeze the apartment column and the day header row, highlight today, shade weekends, bookings as bars with guest name, prev/next month, tap a bar to see details.
- Form: apartment picker, date range picker, inline "Occupied" error from server 409, success feedback, then reset.
- All UI text in English.

## Distribution
- Mobile app does NOT run on Vercel. Vercel hosts only `api/*` and the web app.
- Mobile: Expo. Testing via Expo Go / development build; later EAS Build for installable APK (Android) / TestFlight (iOS).
- The mobile app talks to the production API URL above (configurable via env, e.g. `EXPO_PUBLIC_API_URL`).

## Local setup & testing on a phone (give the owner these steps, one at a time)
Owner uses **Windows** + VS Code.
1. Install Node.js LTS and Git. Clone the repo, run install at the root.
2. Web: run the web app dev server, open in browser.
3. API locally: `npx vercel dev` (after `npx vercel link`), or point clients at the production API.
4. **Phone, quickest (Android or iPhone):** install **Expo Go** from the store. Phone and PC on the same Wi-Fi. Run `npx expo start` in `apps/mobile`, scan the QR code. If Wi-Fi blocks it, use `npx expo start --tunnel`.
5. **Android via USB (real installed test build):** enable Developer options + USB debugging on the phone, install Android Studio (SDK + adb), connect USB, accept the prompt, run `npx expo run:android`. This installs a development build on the phone.
6. **Shareable test APK:** `npx eas build -p android --profile preview`, then install the APK from the link.
7. iPhone native builds need a Mac or EAS + Apple developer account; until then use Expo Go.
Keep Expo SDK compatible with the current Expo Go version.

## Working style
- Owner: Slobodan, senior frontend dev (Vue/TS daily, knows React). Prefers short answers and numbered step-by-step instructions, one step at a time.
- All names, labels and UI text in English.
- Don't break the live `index.html` / `api/*` until the new apps replace them.

## First tasks
1. Set up workspaces + `packages/core` with models, overlap util and tests.
2. `ReservationFormVM` and `CalendarVM` with tests.
3. Expo app with the Calendar screen using the calendar API; get it running on the owner's phone (steps above).
4. New reservation screen.
5. Auth proposal, then implementation.
6. Web app.
