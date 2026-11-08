# ADR 0008: Authentication (sessions, login limits, the guard)

**Status:** Accepted, approved by the owner on 2026-11-08
**Date:** 2026-11-08
**Project:** airtable-reservation-form
**Depends on:** [ADR 0004](0004-initial-schema.md), [ADR 0006](0006-mobile-navigation.md), [ADR 0007](0007-access-model.md)
**Brief:** [`docs/briefs/authentication.md`](../briefs/authentication.md) (it replaced the first proposal, which had a plain 30 day session)

## Context

ADR 0007 decided who may do what (users, roles, permissions) and how passwords are stored. It did not say how a signed-in user is recognised on the next request, how repeated wrong passwords are slowed down, or how the API refuses callers. Until now every endpoint was public, including owner contact data and the users list (`KNOWN_ISSUES.md` 17 and 19).

## Decision

**Database sessions, not JWT.** A change of permissions, or deactivating a user, must apply on the very next request (ADR 0007); a signed token cannot be recalled.

- **Token:** at login the server makes a random 32-byte token (base64url) and stores only its SHA-256 hash in `sessions.token_hash`. The token goes to the client once. The app sends `Authorization: Bearer <token>` and keeps it in `expo-secure-store` (Android Keystore / iOS Keychain). There is no web cookie yet (no web app).
- **Expiry:** sliding 30 days, hard cap 90 days from login. Every authenticated request moves `expires_at` to now + 30 days, never past `max_expires_at` (login + 90 days; the table has a check `expires_at <= max_expires_at`). After that a new login is needed. The slide happens in the same statement that checks the session (`resolveSession` in `api/_sessions.js`).
- **End of a session:** logout sets `is_active = false`; nothing is deleted (ADR 0007). `created_by` is the session's own user, `updated_by` the admin when the admin revokes it.
- **Tables** (migrations 0006 and 0007): `sessions` (ADR 0004 conventions, index on `user_id`, `updated_at` trigger, delete and truncate triggers) and `login_attempts` (insert only, an exception to ADR 0004: no `is_active`, `updated_at`, `created_by` or `updated_by`, because a row never changes and a failed attempt has no user). `delta_app` has INSERT and SELECT on `login_attempts` but its UPDATE was revoked.

**Login flow, in this order** (`api/_login.js`):
1. Check the limits. Over the limit: 429 with `Retry-After`, the password is not checked and no attempt is recorded.
2. Unknown email, inactive user (or role) or wrong password: record a failed attempt and return 401 "Invalid email or password". The message is the same for all three, and an unknown email is checked against a dummy bcrypt hash so the response time reveals nothing.
3. Success: in one transaction record the attempt, set `last_login_at` and create the session. The response is the token, the user, the permission names and `expiresAt`.

**Limits** (`api/_loginLimits.js`): in 15 minutes, 5 failures for the same email from the same IP, or 30 failures from the same IP, give 429. There is deliberately no lockout by email alone, so nobody can lock the admin out by typing wrong passwords. The IP is the first value of `x-forwarded-for` (set by Vercel; locally the socket address). Only failures count.

**The guard, deny by default** (`api/_guardCore.js`, `api/_guard.js`). Every file in `api/` exports its handler through exactly one of `protect('can_...', handler)`, `authenticated(handler)` or `publicRoute(handler)`. One statement reads the session, the active user, the active role and the active permissions. 401 means not signed in (no, unknown, expired or inactive session, inactive user or role); 403 means signed in without the permission. `scripts/api-guard.test.mjs` fails if a route has no guard, pins the approved route table, and runs a role × endpoint matrix on the real route files.

| Route | Rule |
| --- | --- |
| `POST /api/auth/login` | public (the only public route) |
| `GET /api/auth/me`, `POST /api/auth/logout` | any signed-in user |
| `GET /api/calendar` | `can_view_reservation` |
| `GET /api/apartments` | `can_view_apartment` |
| `GET /api/users` | `can_view_user` |

**Field filtering.** Without `can_view_apartment_owner_contact` the server does not select or send `ownerName` and `ownerPhone`; without `can_view_apartment_rent` it does not send `monthlyRentEur`. The keys are absent, not null. In `packages/core` these three fields are optional and the screens skip them.

**The app.** `Stack.Protected` keeps signed-out users on the login screen. On start (and when the app returns to the foreground) it asks `GET /api/auth/me`, so permissions changed by the admin apply at once; a 401 anywhere signs the user out. Calendar, Apartments and Users are tabs only with `SCREEN_PERMISSIONS` (in `packages/core`), a screen opened by a stale route shows "No access", Home greets the user and has "Sign out". Without a connection at start the token is kept and the app offers "Try again". `AuthProvider` is temporary and becomes `AuthVM` in the ViewModels task.

## Consequences

- **Every authenticated request writes** the session row (the slide), so `updated_at` moves on each call. Fine at our volume.
- `sessions` and `login_attempts` only grow (nothing is deleted); at our volume this is irrelevant.
- **No "log out everywhere" and no device list.** A stolen token works until it is revoked, the user is deactivated, or it expires. Revoking a user's sessions when the admin sets a new password is part of subtask 5 of the users brief (`TODO.md`).
- The deployed app and API must move together: once this is on `main`, an older build of the app, which sends no token, gets 401 everywhere. Only the owner uses the app, so this is acceptable, but it is why the push to `main` needs the owner's explicit OK.
- Vercel Production still reads the Neon `dev` branch (ADR 0005); real data still must not be entered until the production branch exists.
- The real SQL of the session (slide, cap, expired, inactive, revoked) cannot be checked with a fake client, so `scripts/sessions-db.test.mjs` runs it on the dev branch. It writes (inactive) session rows that can never be deleted, so it is opt-in: `RUN_SESSION_DB_TESTS=1 npm run test:scripts`.

## Out of scope / open

- Users changing their own password (the admin sets a new one, subtask 5), 2FA, mail, the web cookie.
- Whether the limits (5 / 30 per 15 minutes) are right in practice: revisit with real use.
- `x-forwarded-for` can be set by a client when the API runs outside Vercel; the dev server is local only.
