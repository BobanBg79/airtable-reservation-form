# Known issues

Open problems found while reviewing the repo (2026-11-05). Tick a box when it is fixed; add new items at the bottom of the right section.

## Security and correctness (`api/`)

- [ ] **1. No authentication.** Anyone can `POST /api/reserve`. Deferred on purpose; see "Auth" in `CLAUDE.md` (propose the approach before implementing).
> Database decision: Airtable is being replaced by PostgreSQL on Neon (`docs/decisions/0001-database.md`). Items 2 to 4 below are obsolete for that reason; no further work on Airtable (no edit/cancel endpoint, no Airtable automations).

- [x] **2. Status model.** Done and deployed: `Active` (default), `Inquiry`, `Cancelled`, `No show` in `api/_status.js`; Airtable options renamed, both automations deleted. Carries over to Postgres: the exclusion constraint applies only to `Active` and `Inquiry`. Open follow-ups: let the calendar API return `status` so the app can draw `Inquiry` differently, and let the reservation form create an `Inquiry`.
- [x] **3. Race condition.** Obsolete: the Postgres exclusion constraint on (apartment, date range) prevents overlapping bookings atomically, including for edits. Map the constraint error to HTTP 409.
- [x] **4. Unchecked optional fields.** Obsolete for Airtable: `api/reserve.js` is rewritten on Postgres. Keep the intent: validate `phone`, `note`, `amount` (type, length) in the new endpoint and return 400.
- [ ] **5. UTC default month.** `api/calendar.js` uses UTC for the default month when `?month=` is missing. The mobile app always sends the month, so low priority.
- [ ] **6. No tests for `api/`.** The input validation added in `60f859a` was only checked with a throw-away script. Add Vitest tests (the handler can be called with a fake `req`/`res`; validation returns before any network call).

## Mobile app (`apps/mobile`)

- [ ] **7. Truncated apartment names.** "Margareta" shows as "Margar…" in the 108 px name column (`NAME_W` in `MonthGrid.tsx`). Affects any long name.
- [ ] **8. Small touch targets.** Month arrows are 32 px in landscape (recommended minimum 48 px).
- [ ] **9. Portrait toolbar.** "November 2026" wraps onto two lines. (In Expo Go the dev gear overlaps "Today"; dev-only, will not exist in a real build.)
- [ ] **10. Temporary data hook.** `useCalendarData` is a stand-in for `CalendarVM` (task 2 in `CLAUDE.md`); it should hold no logic.
- [ ] **11. Client-generated reservation ids.** `packages/core/src/services/apiClient.ts` builds ids as `apartmentId:checkIn:checkOut:index` because `api/calendar.js` returns no Airtable record id. Fine for display; needed for edit/cancel, so return the real id from the API first.

## Repo and environment

- [x] **12. Legacy pages.** `index.html` and `calendar.html` deleted (owner OK). They disappear from production on the next push to `main`.
- [ ] **12b. Shared logic still duplicated.** `api/_status.js` and the validation/overlap code in `api/reserve.js` duplicate `packages/core`. Move it to `core` and import it from `api/`; needs a verified Vercel build first (`core` is TypeScript source only, no build output).
- [ ] **13. Vercel builds the whole workspace.** Production installs the Expo dependencies although `api/*` does not use them. The build passes but is slower than necessary; fix with `.vercelignore` or a custom install command.
- [ ] **14. `adb` not on PATH in the current VS Code session.** The folder is already in the user PATH; restarting VS Code picks it up. Until then use the full WinGet path to `adb.exe`.
- [ ] **15. `npm audit`: 5 moderate vulnerabilities** (2026-11-06), all in the Expo dev toolchain, none in code we ship: `expo`, `@expo/cli`, `@expo/fingerprint` (all via `glob`/`minimatch`), `glob` (AbortSignal cancellation bypass allows post-timeout filesystem traversal) and `minimatch` (denial of service via globparts amplification). The only suggested fix is `expo@53.0.11`, a downgrade from SDK 58; do NOT run `npm audit fix --force`. Revisit with the next Expo SDK upgrade.

## Done

- [x] Calendar landscape layout: header/body alignment, weekend shading, clipped day numbers, header height, gear overlap, empty first row (`1005a98`, `a84f480`).
- [x] Booking details dialog crash (Fragment as first `Dialog` child) (`108551a`).
- [x] `api/reserve.js` input validation against formula injection; Belgrade date in `calendar.html` (`60f859a`).
- [x] `node_modules` ignored at every level (`.gitignore`).
