# CLAUDE.md — Delta Reservations

Context handoff for Claude Code. Read this fully before writing code.

## Your role
You are a senior frontend engineer and an expert in React, React Native (Expo) and TypeScript, with a strong eye for UI/UX design. Build production-quality, clean, tested code and a genuinely beautiful interface.

## What this is
Booking system for 15 rental apartments (Delta Apartmani, Serbia). Two people enter reservations, others only view. Must work great on phones.

## Current state (keep working until the rewrite replaces it)
- **Database:** Airtable base `Delta Rezervacije` (`appJVQJgv7iD74lR1`).
  - Table `Apartments` (`tbl28fxdzAJ9oYKsC`): `Name`, `Note`, `Reservations` (link).
  - Table `Reservations` (`tbl9OHuC2m4S8tT6Q`): `Guest`, `Apartment` (link to Apartments), `Check-in` (date), `Check-out` (date), `Phone`, `Status` (single select, English names only: `Active` = default for every new reservation, `Inquiry` = short-term hold that blocks the calendar, `Cancelled`, `No show`; `Cancelled` and `No show` free the dates, everything else blocks — see `api/_status.js`), `Amount` (EUR), `Note`.
  - Apartments: Atlas, Berlin, Devetka, Egzotik, Eli, Kapiten, Karuzo, Luna, Margareta, Mimoza, Modena, Mona, Neva, Neven, Onyx.
  - Airtable automations are being removed: overlap logic lives only in our code (`api/reserve.js`, `packages/core`). Add automations back later only if needed.
- **Hosting:** Vercel project `airtable-reservation-form`, team `boban2`, Hobby plan. Env vars: `AIRTABLE_TOKEN`, `AIRTABLE_BASE`. Auto-deploys from `main`.
  - **Public production URL (use this in apps): https://airtable-reservation-form.vercel.app**
  - Do NOT use `...-boban2.vercel.app` or per-deployment URLs: they are behind Vercel login (302) and phones cannot reach them.
- **Existing files:**
  - `api/apartments.js` — GET list of apartments.
  - `api/reserve.js` — POST booking; rejects overlaps with 409 before saving.
  - `api/calendar.js` — GET `?month=YYYY-MM`, apartments + non-cancelled reservations in month.
  - `index.html` — plain booking form. `calendar.html` — plain monthly grid.

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
    models/        # types, date + overlap utils
    services/      # api client for /api/* (base URL configurable)
    viewmodels/    # framework-agnostic: CalendarVM, ReservationFormVM, AuthVM
  react-bindings/  # thin hooks: useCalendarVM, useReservationFormVM, useAuthVM
apps/
  mobile/          # React Native (Expo) — PRIORITY
  web/             # React + React Router (Vite)
api/               # Vercel serverless functions
```

Rules:
- `core` must be pure TypeScript, unit-tested (Vitest), no imports from React/RN.
- Views contain no business logic: they render VM state and call VM commands.
- Use npm workspaces.

## Design
- Material Design 3. Mobile: React Native Paper. Web: MUI.
- Modern, calm, premium hospitality feel. Generous spacing, rounded cards, clear typography, one strong accent colour, light + dark mode.
- Each apartment gets its own consistent colour for booking bars.
- Smooth, subtle animations; large touch targets; one-handed use.
- **Calendar:** scroll both directions, frozen apartment column and day header row, today highlighted, weekends shaded, bookings as bars with guest name, prev/next month, tap a bar for details.
- **Form:** apartment picker, date range picker, inline "Occupied" error from server 409, success feedback, then reset.
- All UI text in English.

## Distribution
- Mobile app does NOT run on Vercel. Vercel hosts only `api/*` and the web app.
- Mobile: Expo SDK 58 (needs Node >= 22.13). Test via Expo web / Expo Go / dev build; later EAS Build for APK / TestFlight.
- Mobile app uses the public production URL above (via `EXPO_PUBLIC_API_URL`).

## Local setup & phone testing (give the owner these steps one at a time)
Owner uses **Windows** + VS Code.
1. Node.js LTS (>= 22.13) and Git. Clone, `npm install` at the root.
2. Quickest: in `apps/mobile` run `npx expo start`, press `w` for the browser.
3. Phone: install **Expo Go**, same Wi-Fi as the PC, scan the QR code. If blocked, `npx expo start --tunnel`.
4. Android via USB: Developer options + USB debugging, Android Studio (SDK + adb), then `npx expo run:android`.
5. Shareable APK: `npx eas build -p android --profile preview`.
6. iPhone native builds need a Mac or EAS + Apple developer account; until then Expo Go.

## Working style
- Owner: Slobodan, senior frontend dev (Vue/TS daily, knows React). Short answers, numbered steps, one at a time. Wants tangible results early.
- All names, labels and UI text in English.
- Everything written into the repo is in English, always: code, comments, commit messages, docs (`KNOWN_ISSUES.md`, `CLAUDE.md`), PR descriptions, test names. Only the live chat with the owner may be in Serbian (ekavica).
- Work on feature branches; never push or merge to `main` without the owner's OK.
- Don't break the live `index.html` / `api/*` until the new apps replace them.

## Progress
- Branch `feat/core` (local): workspaces, `packages/core` (models, dates, overlap, validation, tests) and `apps/mobile` Calendar screen (Expo SDK 58) done.
- Next: owner verifies Calendar in the browser, then New reservation screen, ViewModels, auth, web app.
