# CLAUDE.md — Delta Reservations

Context handoff for Claude Code. Read this fully before writing code.

## Your role
You are a senior frontend engineer and an expert in React, React Native (Expo) and TypeScript, with a strong eye for UI/UX design. Build production-quality, clean, tested code and a genuinely beautiful interface.

## What this is
Booking system for 15 rental apartments (Delta Apartmani, Serbia). Two people enter reservations, others only view. Must work great on phones.

## Current state (keep working until the rewrite replaces it)
- **Database:** PostgreSQL on Neon (project `Delta`, `damp-dream-71823503`). The only data source: the code no longer talks to Airtable (the Airtable base still holds the old data until it is migrated; see `TODO.md`).
  - Schema: `db/schema.ts` (tables `apartments`, `reservations`); statuses `active` (default), `cancelled`, `no_show`, and `inquiry` to be added (`TODO.md`). `cancelled` and `no_show` free the dates, everything else blocks (`api/_status.js`).
  - The 15 real apartments (Atlas, Berlin, Devetka, Egzotik, Eli, Kapiten, Karuzo, Luna, Margareta, Mimoza, Modena, Mona, Neva, Neven, Onyx) are not in Postgres yet: that is the one-time data migration. The `dev` branch has three fake ones (Atlas, Berlin, Devetka) and ten fake reservations from `npm run db:seed`.
  - Overlap logic: `packages/core` plus (to come) the database exclusion constraint, which is the final guard.
- **Hosting:** Vercel project `airtable-reservation-form` (the name is historical), team `boban2`, Hobby plan. Auto-deploys from `main`. Needs `DATABASE_URL` (role `delta_app`, pooled) in its Production environment variables.
  - **Public production URL (use this in apps): https://airtable-reservation-form.vercel.app**
  - Do NOT use `...-boban2.vercel.app` or per-deployment URLs: they are behind Vercel login (302) and phones cannot reach them.
  - **Pushing the Postgres API to `main` breaks the production API** until the production Neon branch has the schema, roles and data and Vercel has `DATABASE_URL`. See `TODO.md`, "Production".
- **Existing files:**
  - `api/apartments.js` — GET list of active apartments.
  - `api/calendar.js` — GET `?month=YYYY-MM`, apartments + reservations that block dates in month.
  - There is no write endpoint yet: `api/reserve.js` (Airtable) was removed; create, edit and cancel are to be written on Postgres (`TODO.md`).
  - Helpers (not routes): `api/_db.js` (the Neon connection), `api/_pgReads.js` (read queries), `api/_status.js`, `api/_dbGuard.js`.
  - The old `index.html` / `calendar.html` pages were deleted; the apps are the only clients.
- **Local API for the app:** `npm run dev:api` serves `api/` on `http://127.0.0.1:3000` from the Neon `dev` branch (no `vercel dev` needed). `apps/mobile/.env.local` points the app at it (`EXPO_PUBLIC_API_URL`); a phone on USB needs `adb reverse tcp:3000 tcp:3000`.

## Business rules (must hold in every client)
- Overlap = same apartment AND `newCheckIn < existingCheckOut` AND `newCheckOut > existingCheckIn`.
- Same-day changeover allowed (one leaves, next arrives same day).
- Cancelled bookings never block dates.
- Check-out must be after check-in. Guest, apartment, check-in, check-out required.
- The server and the database are the source of truth for overlap (the reservation endpoint, to be written on Postgres, plus the exclusion constraint); clients may pre-check for UX but never skip the server check.
- Database credentials never reach a client. Clients only call our `/api/*` endpoints.
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
- Git flow: local `main` is only ever updated from `origin/main` (`git checkout main && git pull origin main`); never commit, merge or fast-forward feature work into local `main`. Always work on local feature branches; for now they go straight to `origin/main` with `git push origin <feature-branch>:main` (fast-forward only, no pull request, no force), after which local `main` is pulled again. Never push to `main` without the owner's OK.
- Don't break the live `api/*`: the mobile app uses it in production.

## Neon / database rules
The database is PostgreSQL on Neon (Neon project `Delta`, `damp-dream-71823503`); the data source is always Neon, with no switch and no Airtable code. Decisions live in `docs/decisions/` (ADR 0001 database, 0002 roles and local env safety, 0003 soft delete, 0004 schema): read them before any database or schema work. No new work on Airtable.
- Locally always use the Neon `dev` branch. The app connects as `delta_app`; `neondb_owner` is only for migrations (`MIGRATION_DATABASE_URL`) and never goes into Vercel.
- After every `neon deploy`, `neon env`, `neon init` or `neon checkout`, run `npm run check:env`. `DATABASE_URL` and `DATABASE_URL_UNPOOLED` must use `delta_app` and `NEON_BRANCH` must be `dev`. If not, fix it before running the app and tell the owner.
- Production connection strings never go into `.env.local` or any local file, and never run `neon` commands with `--branch production` locally. Production credentials live only in Vercel's Production environment variables.
- Never print or commit passwords or connection strings (use `--no-secrets` where a command offers it). `.env`, `.env.local` and `.neon` stay git-ignored. Write `.env.local` without a BOM.
- `neon roles create` defaults to an admin role: always pass `--access read_only` and add grants with SQL.
- Code that opens a database connection must call `assertDevDatabaseSafe()` from `api/_dbGuard.js` when it loads.
- Deactivate instead of delete (ADR 0003): `delta_app` has no `DELETE`.
- Avoid duplication: role and branch names and the "safe env" rule live only in `api/_dbGuard.js` (`APP_ROLE`, `OWNER_ROLE`, `DEV_BRANCH`, `checkDevDatabaseEnv`); scripts and configs import them. `.env.local` is parsed only by `scripts/load-env-local.mjs`.
- `npm run db:seed` fills the `dev` branch with fake apartments (`scripts/seed-data.mjs`). Dev only, manual only: never wire it into any build, install or deploy step.
- The schema is Drizzle: `db/schema.ts` and reviewed SQL in `db/migrations/` (ADR 0004). Change it only through migrations (`docs/database-migrations.md`): edit schema, `npm run db:generate`, review the SQL, `npm run db:migrate` (dev only). Never edit an applied migration.

## Where things are written
- Planned work and task descriptions: `TODO.md`. Known problems: `KNOWN_ISSUES.md`. Decisions: `docs/decisions/` (ADRs). Keep them separate and update them when work is done.

## Progress
- Branch `feat/core` (local): workspaces, `packages/core` (models, dates, overlap, validation, tests) and `apps/mobile` Calendar screen (Expo SDK 58) done.
- Next: owner verifies Calendar in the browser, then New reservation screen, ViewModels, auth, web app.
