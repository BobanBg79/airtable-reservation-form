# ADR 0006: Mobile navigation and apartment details

**Status:** Accepted
**Date:** 2026-11-08
**Project:** airtable-reservation-form
**Depends on:** [ADR 0004](0004-initial-schema.md), [ADR 0005](0005-vercel-uses-neon-dev.md)

## Context

The mobile app was a single calendar screen. The owner asked for several screens (a greeting screen, the calendar, an apartments list and read-only apartment details), reachable from a bottom menu, with the same calm Material 3 look as the calendar. Tapping an apartment name in the calendar must open that apartment's details.

## Decision

**Routes** (Expo Router, `apps/mobile/src/app`):

| Route | File | What it is |
|---|---|---|
| `/` | `(tabs)/index.tsx` | Home: a greeting and two shortcuts. The signed-in user comes with authentication. |
| `/calendar` | `(tabs)/calendar.tsx` | The multi-calendar (moved from `index.tsx`). |
| `/apartments` | `(tabs)/apartments.tsx` | The apartments list; two columns on a wide screen. |
| `/apartment/[id]` | `apartment/[id].tsx` | Read-only details of one apartment. |
| `/users` | `(tabs)/users.tsx` | The users list (built 2026-11-08; fourth tab; temporarily public, admin only after authentication). |

- **Planned by [ADR 0007](0007-access-model.md):** `/users` (the Users screen: a list now, temporarily public, admin only after authentication; create and edit follow) and `/roles` (Manage roles, admin only: each role's permissions, read-only for admin). Both are protected routes; a tab or menu entry appears only with the matching permission.
- **Bottom tabs** for Home, Calendar and Apartments, built with the headless `expo-router/ui` (`Tabs`, `TabSlot`, `TabList`, `TabTrigger asChild`). In SDK 58 `Tabs` from `expo-router` is deprecated. The bar is our own Material 3 style (`components/TabBarItem.tsx`): a pill behind the selected icon, labels under the icons in portrait, and a shorter bar with icon and label side by side in landscape, where height is scarce (the calendar already needs it).
- **Details are pushed on the root stack**, above the tabs, so Back returns to wherever the user came from (the list or the calendar), and the tab bar is hidden on the detail screen.
- **Tapping an apartment name in the calendar** (`MonthGrid` `onPressApartment`) pushes `/apartment/<id>`. A row in the list does the same.
- **One shared load of the apartments:** `state/ApartmentsProvider.tsx` fetches `/api/apartments` once for the whole app (list, details and the Home shortcut read the same data). `src/api.ts` is the single API client. This provider is a temporary stand-in for a ViewModel in `packages/core`, like `hooks/useCalendarData.ts`.
- **`GET /api/apartments` returns every detail** (address, apartment number, floor, building, area, owner name and phone, monthly rent, amenities, parking spot) in camelCase with string ids (`api/_pgReads.js` `loadApartmentDetails`). The calendar keeps its smaller `{ id, name }` list.
- **Logic stays out of the views** (CLAUDE.md rules): parsing the response, `formatFloor`, `formatEur`, `formatArea`, `apartmentAmenities`, `apartmentLocationLine` and `findApartment` live in `packages/core` with unit tests.
- **One colour per apartment everywhere**, from `apartmentHues` in `core`: calendar bars, list avatars and the detail hero.

## Consequences

- **Privacy:** the API has no authentication, so `/api/apartments` now publishes the owner's name and phone and the rent to anyone who knows the URL. Acceptable only because the data is fake (ADR 0005). Real data must not be entered until there is auth, or those fields are limited to the business_owner role and admin (`KNOWN_ISSUES.md` 17).
- **Landscape:** the bottom bar takes about one calendar row (7 of 9 apartments fit without scrolling on the test phone) (`KNOWN_ISSUES.md` 18).
- The temporary providers and hooks (`ApartmentsProvider`, `useCalendarData`) have to move into ViewModels before more screens depend on them (`TODO.md`).
- Detail screens will later hold an apartment's reservations and an edit mode; edit needs auth first.

## Things learned while building it (worth remembering)

- **Android view flattening:** a `View` that has no background when it mounts and gets one later can lose its rounded corners (the tab indicator was drawn square). Give it a transparent background from the start and `collapsable={false}`.
- **`forwardRef` and `View` types in React Native 0.88:** typing a ref as `View` fails; the tab item does not need a ref, so it is a plain function component.
- **Navigation state after rotating the phone** can look stale until the screen is reopened; relaunch Expo Go before judging a layout in the other orientation.
- **adb:** `adb reverse --list` can hang the adb server; restart it (`Get-Process adb | Stop-Process`, `adb start-server`). See the `phone-preview` skill.
- Parameters used inside a `CHECK` constraint or `DEFAULT` must be literals, not bind parameters (see ADR 0004 notes).

## Open questions

- Should the bottom bar hide while the calendar grid is scrolled, to win back the row it covers in landscape?
- Should the Home screen show something useful besides the greeting (today's arrivals and departures), once the data is there?
