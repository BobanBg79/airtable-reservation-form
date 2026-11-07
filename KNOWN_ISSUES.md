# Known issues

Open problems found while reviewing the repo (2026-11-05). Tick a box when it is fixed; add new items at the bottom of the right section.

## Security and correctness (`api/`)

- [ ] **1. No authentication.** There is no write endpoint at the moment (`api/reserve.js` was removed with Airtable), so nothing can be written through the API. Auth must be in place before the new create, edit and cancel endpoints exist; see "Auth" in `CLAUDE.md` (propose the approach before implementing).

> Database decision: Airtable was replaced by PostgreSQL on Neon (`docs/decisions/0001-database.md`) and the code no longer uses it. Items 2 to 4 below are closed for that reason.

- [x] **2. Status model.** In Postgres: `active` (default), `cancelled`, `no_show`; `cancelled` and `no_show` free the dates (`api/_status.js`). Open follow-ups: add `inquiry` (`TODO.md`), let the calendar API return `status` so the app can draw an inquiry differently, and let the reservation form create one.
- [x] **3. Race condition.** Closed by design: the Postgres exclusion constraint on (apartment, date range) will prevent overlapping bookings atomically, including for edits (`TODO.md`, task 2). Map the constraint error to HTTP 409.
- [x] **4. Unchecked optional fields.** The old endpoint is gone. Keep the intent: validate `phone`, `note`, `amount` (type, length) in the new endpoint and return 400.
- [ ] **5. UTC default month.** `api/calendar.js` uses UTC for the default month when `?month=` is missing. The mobile app always sends the month, so low priority.
- [ ] **6. Handlers in `api/` are untested.** The guard (`_dbGuard.js`) and the read queries (`_pgReads.js`, with a fake SQL client) have tests (`npm run test:api`, Node's built-in `node:test`, part of `npm test`), but `calendar.js` and `apartments.js` themselves do not (month parsing, error response). Add tests the same way (call the handler with a fake `req`/`res`; the SQL client needs to be injectable first).

## Mobile app (`apps/mobile`)

- [x] **7. Truncated apartment names.** Fixed: the name column is 120 px wide (`NAME_W` in `MonthGrid.tsx`, shared by the header and the body) and a longer name shrinks to at most 80% instead of being cut. "Margareta", the longest of the real names, shows in full (checked on the phone).
- [ ] **8. Small touch targets.** Month arrows are 32 px in landscape (recommended minimum 48 px).
- [ ] **9. Portrait toolbar.** "November 2026" wraps onto two lines. (In Expo Go the dev gear overlaps "Today"; dev-only, will not exist in a real build.)
- [ ] **10. Temporary data hook.** `useCalendarData` is a stand-in for `CalendarVM` (task 2 in `CLAUDE.md`); it should hold no logic. `state/ApartmentsProvider.tsx` is a temporary stand-in for a ViewModel too (it loads the apartments for the whole app).
- [ ] **11. Client-generated reservation ids.** `packages/core/src/services/apiClient.ts` builds ids as `apartmentId:checkIn:checkOut:index` because `api/calendar.js` does not return the reservation id yet (Postgres has it: `reservations.id`). Fine for display; needed for edit/cancel, so return the real id from the API and use it in `mapCalendarResponse` first.

## Repo and environment

- [x] **12. Legacy pages.** `index.html` and `calendar.html` deleted (owner OK). They disappear from production on the next push to `main`.
- [ ] **12b. Shared logic still duplicated.** The overlap and validation rules in `packages/core` will be needed by the new write endpoint in `api/` as well. Move them to a shared place and import them from `api/`; needs a verified Vercel build first (`core` is TypeScript source only, no build output).
- [ ] **13. Vercel builds the whole workspace.** Production installs the Expo dependencies although `api/*` does not use them. The build passes but is slower than necessary; fix with `.vercelignore` or a custom install command.
- [ ] **14. `adb` not on PATH in the current VS Code session.** The folder is already in the user PATH; restarting VS Code picks it up. Until then use the full WinGet path to `adb.exe`.
- [ ] **15. `npm audit`: 5 moderate vulnerabilities** (2026-11-06), all in the Expo dev toolchain, none in code we ship: `expo`, `@expo/cli`, `@expo/fingerprint` (all via `glob`/`minimatch`), `glob` (AbortSignal cancellation bypass allows post-timeout filesystem traversal) and `minimatch` (denial of service via globparts amplification). The only suggested fix is `expo@53.0.11`, a downgrade from SDK 58; do NOT run `npm audit fix --force`. Revisit with the next Expo SDK upgrade.
- [ ] **16. Production reads the Neon `dev` branch (ADR 0005).** `api/calendar.js` and `api/apartments.js` read only from Neon, and for now Vercel Production is pointed at the `dev` branch, so the deployed app shows fake data and no real data may be entered. Order matters: add `DATABASE_URL` to Vercel Production before pushing the Postgres API to `main`, otherwise the production API returns 500. Ends with the "Production" item in `TODO.md` (production branch with its own roles and passwords, schema, real data, safe migrations, backup).
- [ ] **17. The API is open and now publishes owner contact data.** `GET /api/apartments` returns every apartment's owner name, owner phone and rent to anyone who knows the URL (there is no auth yet). Harmless with the fake dev data, but real data must not go in until there is auth, or those fields are limited to the business_owner role and admin (`CLAUDE.md`, "Auth").
- [ ] **18. Landscape calendar loses about a row to the bottom bar.** With the bar visible, 7 of 9 apartment rows fit without scrolling on the test phone. Options: a slimmer bar, or hide it while scrolling the grid.

## Done

- [x] Calendar landscape layout: header/body alignment, weekend shading, clipped day numbers, header height, gear overlap, empty first row (`1005a98`, `a84f480`).
- [x] Booking details dialog crash (Fragment as first `Dialog` child) (`108551a`).
- [x] `api/reserve.js` input validation against formula injection; Belgrade date in `calendar.html` (`60f859a`).
- [x] `node_modules` ignored at every level (`.gitignore`).
