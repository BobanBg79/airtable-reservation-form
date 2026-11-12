# CLAUDE.md — Delta Reservations

Context handoff for Claude Code. Read this fully before writing code.

## Your role
You are a senior frontend engineer and an expert in React, React Native (Expo) and TypeScript, with a strong eye for UI/UX design. Build production-quality, clean, tested code and a genuinely beautiful interface.

## What this is
Booking system for 15 rental apartments (Delta Apartmani, Serbia). Two people enter reservations, others only view. Must work great on phones.

## Current state (keep working until the rewrite replaces it)
- **Database:** PostgreSQL on Neon (project `Delta`, `damp-dream-71823503`). The only data source: the code no longer talks to Airtable (the Airtable base still holds the old data until it is migrated; see `TODO.md`).
  - Schema: `db/schema.ts` (tables `apartments`, `reservations`); statuses `active` (default), `cancelled`, `no_show`, and `inquiry` to be added (`TODO.md`). `cancelled` and `no_show` free the dates, everything else blocks (`api/_status.js`).
  - The 15 real apartments (Atlas, Berlin, Devetka, Egzotik, Eli, Kapiten, Karuzo, Luna, Margareta, Mimoza, Modena, Mona, Neva, Neven, Onyx) are not in Postgres yet: that is the one-time data migration. The `dev` branch has nine of them (the first nine names, with made-up details) and 25 fake reservations from `npm run db:seed`.
  - Overlap logic: `packages/core` plus (to come) the database exclusion constraint, which is the final guard.
- **Hosting:** Vercel project `airtable-reservation-form` (the name is historical), team `boban2`, **Pro plan** (upgraded by the owner on 2026-11-12, so the Hobby limit of 12 serverless functions no longer applies; 11 routes today). Auto-deploys from `main`. Its only database variable is `DATABASE_URL` (role `delta_app`, pooled).
  - **Current decision (ADR 0005):** Vercel Production connects to the Neon `dev` branch until the production branch is ready. So the deployed app shows the fake dev data, and no real data may be entered. Never add `MIGRATION_DATABASE_URL` (owner) or `READONLY_DATABASE_URL` to Vercel.
  - **Public production URL (use this in apps): https://airtable-reservation-form.vercel.app**
  - Do NOT use `...-boban2.vercel.app` or per-deployment URLs: they are behind Vercel login (302) and phones cannot reach them.
  - **Order matters:** add `DATABASE_URL` to Vercel Production before pushing the Postgres API to `main`, otherwise the production API returns 500 (`KNOWN_ISSUES.md` 16).
- **Existing files:**
  - Every route needs a session (ADR 0008): `api/auth/login.js` (public), `api/auth/me.js`, `api/auth/logout.js`, `api/auth/logout-all.js`, `api/calendar.js` (`can_view_reservation`), `api/apartments.js` (`can_view_apartment`; owner contact and rent only with their own permissions), `api/users.js` (`can_view_user`; also one user with `?id=`), `api/roles.js` (`can_view_user`), `api/users/create.js` (`can_create_user`), `api/users/edit.js` (`can_edit_user`), `api/roles/permissions.js` (`can_view_role`) and `api/roles/edit.js` (`can_edit_role`; never the admin role, never an admin-only permission for another role). Every entity has its own create and its own edit route. Each exports its handler through `protect`, `authenticated` or `publicRoute` from `api/_guard.js`; a test fails if a route has none.
  - There is no write endpoint yet: `api/reserve.js` (Airtable) was removed; create, edit and cancel are to be written on Postgres (`TODO.md`).
  - Helpers (not routes): `api/_db.js` (the Neon connection), `api/_pgReads.js` (read queries), `api/_status.js`, `api/_dbGuard.js`.
  - The old `index.html` / `calendar.html` pages were deleted; the apps are the only clients.
- **Running the app on the phone:** by default the app uses the production API (which serves the Neon `dev` data, ADR 0005), so only Expo runs locally. The steps, including taking screenshots with adb, are in the project skill `.claude/skills/phone-preview/SKILL.md` (`/phone-preview`).
- **Local API (optional):** `npm run dev:api` serves `api/` on `http://127.0.0.1:3000` from the Neon `dev` branch (no `vercel dev` needed), for trying API changes before deploying them. To use it, create `apps/mobile/.env.local` (git-ignored) with `EXPO_PUBLIC_API_URL=http://localhost:3000` and run `adb reverse tcp:3000 tcp:3000`; delete the file to go back to production.

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
- Access model (ADR 0007, brief `docs/briefs/users-roles-permissions.md`): five roles, `admin`, `business_owner`, `manager`, `cleaning_lady`, `handyman`; one role per user; permissions attached to roles (`users`, `roles`, `permissions`, `role_permissions`), named `can_<action>_<entity>` or `can_<action>_<entity>_<sub_entity>` with actions only `view`, `create`, `edit` (cancel and deactivate are `edit`; there is no delete). 21 permissions, listed once in `packages/core` (19 at the start, `can_view_role` and `can_edit_role` added for Manage roles). The users and roles permissions are the admin's alone and can never be given to another role. Admin has all of them; only admin manages users and other roles' permissions, and nobody changes the admin role's own permissions (a hard rule, not a permission). The API checks permissions, not role names, and leaves out the fields a caller may not see.
- Login is email + password (email is the username, lowercase), no mail service. Passwords are stored only as a slow salted hash that is never returned to any client; the admin sets and resets them. The owner is the first admin (created by a script) and creates the accounts.
- Sessions (ADR 0008): a database session token, not JWT. At login a random 32-byte token is made and only its SHA-256 hash is stored (`sessions`); the app sends `Authorization: Bearer <token>` and keeps it in expo-secure-store. Expiry slides 7 days with a hard cap of 90 days from login, in the same statement that checks the session. A login does not end the user's other sessions (several devices at once); the user chooses between Sign out (this device) and Sign out of all devices (`POST /api/auth/logout-all`). Logout and revocation set `is_active = false` (`revokeUserSessions` is also to be called from the users endpoints when the admin deactivates a user or sets a new password). Login is rate limited (5 failures per email + IP or 30 per IP in 15 minutes give 429, `login_attempts`), every failure answers "Invalid email or password".
- The guard is deny by default: every route in `api/` uses `protect('can_...', handler)`, `authenticated(handler)` or `publicRoute(handler)`; 401 = not signed in or session ended, 403 = missing permission. Only login is public. New routes need a guard, and the approved route table is pinned in `scripts/api-guard.test.mjs` (change it on purpose).
- Field filtering: without `can_view_apartment_owner_contact` the server leaves out `ownerName` and `ownerPhone`; without `can_view_apartment_rent` it leaves out `monthlyRentEur` (keys absent). These fields are optional in `packages/core` and the screens skip them.
- Screens: Login, Users (list, Add user, details with Edit; admin only by default) and Roles (Manage roles: each role's permissions as switches; admin only by default). Tabs show only with their permission (`SCREEN_PERMISSIONS` in core); a screen opened without it shows "No access".
- Testing the app on the phone now needs a sign-in (the production API requires it once this is deployed): use the owner's account; Claude cannot sign in for the owner.

## Nothing is ever deleted (ADR 0007)
- No row is deleted from any table, `users` and `role_permissions` included: use `is_active = false`. `BEFORE DELETE` and `BEFORE TRUNCATE` triggers refuse it for every role, `neondb_owner` too.
- **Migrations never delete rows from any table, never drop a table or column, and never drop or disable a trigger.** They run only with `npm run db:migrate`. Claude Code writes them; there is no automatic check, so follow this rule every time.
- The dev data is "reset" by deactivating old seed reservations and re-seeding, never by `TRUNCATE` or a new branch (`docs/database-migrations.md`).

## Target architecture: MVVM monorepo
Goal: all logic in Model + ViewModel, so the two Views are thin and developed independently.

```
packages/
  core/            # TypeScript, NO React, NO UI
    models/        # types, date + overlap utils
    services/      # api client for /api/* (base URL configurable)
    viewmodels/    # framework-agnostic: FormVM (every form), userFormVM; to come: CalendarVM, AuthVM
  react-bindings/  # thin hooks, shared by mobile and web: useForm (to come: useCalendarVM, useAuthVM)
apps/
  mobile/          # React Native (Expo) — PRIORITY
  web/             # React + React Router (Vite)
api/               # Vercel serverless functions
```

Rules:
- `core` must be pure TypeScript, unit-tested (Vitest), no imports from React/RN.
- Views contain no business logic: they render VM state and call VM commands.
- Use npm workspaces.

## Mobile app structure (`apps/mobile/src`, Expo Router; see ADR 0006)
- `app/_layout.tsx`: providers (Paper theme, `ApartmentsProvider`) and the root `Stack`.
- `app/(tabs)/_layout.tsx`: bottom navigation. In SDK 58 `Tabs` from `expo-router` is deprecated; use the headless `expo-router/ui` (`Tabs`, `TabSlot`, `TabList`, `TabTrigger asChild`). The bar is our own Material 3 style (`components/TabBarItem.tsx`), shorter with icon and label side by side in landscape. The triggers must be direct children of `<TabList>`.
- Tabs (Home, Calendar, Apartments, Users): `(tabs)/index.tsx` Home (greets the signed-in user, shortcuts by permission, Sign out and Sign out of all devices), `(tabs)/calendar.tsx` the multi-calendar, `(tabs)/apartments.tsx` the list (two columns on a wide screen), `(tabs)/users.tsx` the users list (needs `can_view_user`; a tap opens the user, the Add user button needs `can_create_user`; `GET /api/users` never returns a password hash).
- `app/apartment/[id].tsx`: read-only apartment details, pushed on the root stack so Back returns to the list or to the calendar. Opened from a row in the list and by tapping an apartment name in the calendar (`MonthGrid` `onPressApartment`).
- Data: `src/api.ts` is the one API client; `state/ApartmentsProvider.tsx` loads the apartments once for the whole app (TEMPORARY, to become a ViewModel in `packages/core`, like `hooks/useCalendarData.ts`). Pure logic such as `formatFloor`, `apartmentAmenities`, `formatEur` and the `/api/apartments` parsing lives in `packages/core` with tests.
- **Forms (one behaviour for every entity and every app):** `FormVM` in `packages/core/src/viewmodels/` decides everything a form does: create / view / edit modes, when a field's message shows (after blur or a Save attempt; the server's message until the field changes; other server errors in a banner), required fields, when Save is enabled (required fields filled, nothing being sent, something changed when editing), when Edit shows (view mode, caller may edit), and what Cancel restores (every field, no messages). An entity only provides a `FormDefinition` (see `userFormVM.ts`, rules in `models/userForm.ts`). `@delta/react-bindings` has the one hook (`useForm`). The mobile pieces in `components/form/FormFields.tsx` only draw that state; never put a form rule in a view. User screens: `app/user/new.tsx` (Add user, `can_create_user`) and `app/user/[id].tsx` (details, read-only, Edit with `can_edit_user`), both on `components/UserFormScreen.tsx`; the Users list opens them. Roles: the Roles tab (`(tabs)/roles.tsx`, `can_view_role`) and `app/role/[id].tsx` on `components/RoleFormScreen.tsx` (`roleFormVM.ts`: one switch per permission, Edit with `can_edit_role`, never for the admin role).
- Every apartment keeps one colour everywhere (`apartmentHues` in `core`): calendar bars, list avatars and the detail hero.

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

## Local setup & phone testing
Owner uses **Windows** + VS Code and an Android phone on USB. For running the app on the phone and taking screenshots with adb, use the project skill `.claude/skills/phone-preview/SKILL.md` (`/phone-preview`); it covers adb recovery and landscape testing too. Other options, one step at a time:
1. Node.js LTS (>= 22.13, 22.18 or newer for the scripts that import `packages/core`) and Git. Clone, `npm install` at the root.
2. Quickest: in `apps/mobile` run `npx expo start`, press `w` for the browser.
3. Phone: **Expo Go**, over USB with `adb reverse tcp:8081 tcp:8081` or on the same Wi-Fi with the QR code (`--tunnel` if Wi-Fi blocks it).
4. Android build on the phone: `npx expo run:android` (Android Studio SDK + adb). Shareable APK: `npx eas build -p android --profile preview`.
5. iPhone native builds need a Mac or EAS + an Apple developer account; until then Expo Go.

## Testing rules (owner's rule, no exceptions)
- **Every test imports the real function (or the real route handler) and calls it.** Never copy, mimic or re-implement the behaviour under test inside a test file and then test that copy. A test that re-derives the answer with the same logic proves nothing.
- **Expected values are literals, written out** (for example a spelled-out role x route table), not computed with logic that mirrors the implementation (no `allowed = permissions.includes(...)` in a test to decide what the guard should answer).
- **Fakes are only for the outside world** (the database, the network, the clock) and must not contain the logic being tested. The fake SQL client answers queries; it does not decide.
- Before a piece of test work is done, scan the new test files for helper code that duplicates production logic and remove it.
- `npm test` is offline (no database, no network). Checks that need the real dev database live in `scripts/*.dbtest.mjs` and run with `npm run test:db`.

## Working style
- Owner: Slobodan, senior frontend dev (Vue/TS daily, knows React). **Very short answers in chat**; he asks follow-up questions when something is unclear. Numbered steps, one at a time. Wants tangible results early. Chat is in Serbian (ekavica).
- Commit and push only when the owner asks. He usually says "commit i push" when a piece of work is done; after a push, check that the production API still answers.
- All names, labels and UI text in English.
- Everything written into the repo is in English, always: code, comments, commit messages, docs (`KNOWN_ISSUES.md`, `CLAUDE.md`), PR descriptions, test names. Only the live chat with the owner may be in Serbian (ekavica).
- Git flow: local `main` is only ever updated from `origin/main` (`git checkout main && git pull origin main`); never commit, merge or fast-forward feature work into local `main`. Always work on local feature branches; for now they go straight to `origin/main` with `git push origin <feature-branch>:main` (fast-forward only, no pull request, no force), after which local `main` is pulled again. Never push to `main` without the owner's OK.
- Don't break the live `api/*`: the mobile app uses it in production.

## Neon / database rules
The database is PostgreSQL on Neon (Neon project `Delta`, `damp-dream-71823503`); the data source is always Neon, with no switch and no Airtable code. Decisions live in `docs/decisions/` (ADR 0001 database, 0002 roles and local env safety, 0003 soft delete, 0004 schema, 0005 Vercel uses the dev branch for now, 0006 mobile navigation, 0007 access model and delete protection, 0008 authentication): read them before any database or schema work. No new work on Airtable.
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

## Progress and where to start
Everything below is on `main` (commit and push only on request).

**Done**
- Monorepo with `packages/core` (models, dates, overlap, validation, API client, formatting; Vitest) and `apps/mobile` (Expo SDK 58).
- Neon PostgreSQL with Drizzle migrations, the roles and safety guards (ADRs 0001 to 0005), a dev seed (9 apartments, 25 reservations), and the API reading from Neon. Vercel Production uses the dev branch for now (ADR 0005).
- Mobile app: the multi-calendar (frozen header and apartment column, today and weekends, bars, details dialog, auto-refresh), bottom tabs, the apartments list and read-only apartment details, tapping a name in the calendar opens details (ADR 0006).
- Tooling: the `phone-preview` skill, `npm run dev:api`, `npm run check:env`, `npm test` (core, `api/`, `scripts/`; offline: no database, no network), `npm run test:db` (on purpose: read-only checks of the real dev database, `scripts/*.dbtest.mjs`; with `RUN_SESSION_DB_TESTS=1` it also writes inactive session rows), `npm run typecheck` and `npm run lint` (ESLint: Expo's config for `apps/mobile`, `@eslint/js` + typescript-eslint for the rest; run it, with typecheck and tests, before calling a task done).

**Where to start a new session**
1. `git checkout main && git pull origin main`, then a new feature branch from `main`.
2. Read `TODO.md` (the next tasks, in a suggested order), `KNOWN_ISSUES.md` and the ADRs in `docs/decisions/` that touch the task.
3. Suggested next task: the `inquiry` status and the overlap constraint (the users task, with Manage roles, is done). Apartments and reservations each get their own create and edit routes (the Pro plan has no 12-function limit). After it: the write endpoints with the New reservation screen, ViewModels, then the production branch with the real data, and the web app.
4. To see the app on the phone: `/phone-preview`. The deployed app shows fake dev data and no real data may be entered yet (ADR 0005, `KNOWN_ISSUES.md` 16 and 17).
