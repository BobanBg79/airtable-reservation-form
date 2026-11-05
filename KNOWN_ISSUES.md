# Known issues

Open problems found while reviewing the repo (2026-11-05). Tick a box when it is fixed; add new items at the bottom of the right section.

## Security and correctness (`api/`)

- [ ] **1. No authentication.** Anyone can `POST /api/reserve`. Deferred on purpose; see "Auth" in `CLAUDE.md` (propose the approach before implementing).
- [ ] **2. Hard-coded status names.** `'Otkazano'` and `'Potvrđeno'` are used in `api/reserve.js` (overlap formula and new-record status) and `api/calendar.js` (filter). Renaming the Airtable options to `Active` / `Cancelled` breaks the filter (cancelled bookings start blocking dates) and inserts. Change Airtable and all three places together. Keep the Airtable overlap automation (`⚠ CONFLICT` in `Note`) in mind while doing it.
- [ ] **3. Race condition.** The overlap check and the insert in `api/reserve.js` are not atomic; two simultaneous requests for the same dates can both succeed.
- [ ] **4. Unchecked optional fields.** `phone`, `note` and `amount` in `api/reserve.js` have no type or length validation (`amount: "abc"` becomes `NaN`, `note` as an object is passed through). Likely ends as a generic 500 instead of a clear 400.
- [ ] **5. UTC default month.** `api/calendar.js` uses UTC for the default month when `?month=` is missing. The mobile app always sends the month, so low priority.
- [ ] **6. No tests for `api/`.** The input validation added in `60f859a` was only checked with a throw-away script. Add Vitest tests (the handler can be called with a fake `req`/`res`; validation returns before any network call).

## Mobile app (`apps/mobile`)

- [ ] **7. Truncated apartment names.** "Margareta" shows as "Margar…" in the 108 px name column (`NAME_W` in `MonthGrid.tsx`). Affects any long name.
- [ ] **8. Small touch targets.** Month arrows are 32 px in landscape (recommended minimum 48 px).
- [ ] **9. Portrait toolbar.** "November 2026" wraps onto two lines. (In Expo Go the dev gear overlaps "Today"; dev-only, will not exist in a real build.)
- [ ] **10. Temporary data hook.** `useCalendarData` is a stand-in for `CalendarVM` (task 2 in `CLAUDE.md`); it should hold no logic.
- [ ] **11. Client-generated reservation ids.** `packages/core/src/services/apiClient.ts` builds ids as `apartmentId:checkIn:checkOut:index` because `api/calendar.js` returns no Airtable record id. Fine for display; needed for edit/cancel, so return the real id from the API first.

## Repo and environment

- [ ] **12. Legacy pages.** `index.html` and `calendar.html` are still live in production. Owner says they are no longer needed; deleting them also removes them from the production URL and needs an explicit OK. `index.html` is an open booking form until then.
- [ ] **13. Vercel builds the whole workspace.** Production installs the Expo dependencies although `api/*` does not use them. The build passes but is slower than necessary; fix with `.vercelignore` or a custom install command.
- [ ] **14. `adb` not on PATH in the current VS Code session.** The folder is already in the user PATH; restarting VS Code picks it up. Until then use the full WinGet path to `adb.exe`.

## Done

- [x] Calendar landscape layout: header/body alignment, weekend shading, clipped day numbers, header height, gear overlap, empty first row (`1005a98`, `a84f480`).
- [x] Booking details dialog crash (Fragment as first `Dialog` child) (`108551a`).
- [x] `api/reserve.js` input validation against formula injection; Belgrade date in `calendar.html` (`60f859a`).
- [x] `node_modules` ignored at every level (`.gitignore`).
