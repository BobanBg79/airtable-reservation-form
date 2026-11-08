# Brief for Claude Code: authentication

Approved by the owner on 2026-11-08. Work on the branch `feature/authentication`.

**Before reading this brief:** read the current documentation first: `CLAUDE.md`, `TODO.md`, `KNOWN_ISSUES.md`, `docs/database-migrations.md`, every ADR in `docs/decisions/` (especially ADR 0007) and `docs/briefs/users-roles-permissions.md`. Where this brief and an older doc disagree, this brief wins, and the older doc is updated to match. This brief replaces your earlier authentication proposal where they differ (sliding session).

**How you work:** at the start, show the owner the full task list as a checklist; after each step, show it again with that item ticked. One commit per step.

## Elements

1. **Login:** an endpoint that checks email and password (bcrypt, ADR 0007), with rate limiting.
2. **Session:** database session token (below).
3. **Server guard:** deny by default; 401 = not logged in or session expired, 403 = logged in but missing the permission.
4. **Field filtering:** owner contact and rent left out for roles without the permission.
5. **App:** login screen, permission-based tabs, a no-access screen.

## Decided: sessions

- **Database session token, not JWT.** Permission changes and deactivation take effect immediately (ADR 0007).
- At login the server generates a random 32-byte token and stores only its SHA-256 hash in a `sessions` table, with the user and the expiry.
- The app sends `Authorization: Bearer <token>`; mobile keeps it in SecureStore (Android Keystore / iOS Keychain).
- **Expiry: sliding 30 days, hard cap 90 days from login.** Each authenticated request moves the expiry to now + 30 days (in the same query that checks the session), but never past login + 90 days. Then a new login is required.
- Logout sets `is_active = false`; nothing is deleted, and `sessions` gets the DELETE and TRUNCATE triggers.

## New tables

**`sessions`** (ADR 0004 conventions):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | |
| `user_id` | bigint, FK `users`, not null | |
| `token_hash` | text, unique, not null | SHA-256 of the token; the token itself is never stored |
| `expires_at` | timestamptz, not null | sliding: now + 30 days on each use |
| `max_expires_at` | timestamptz, not null | login + 90 days; `expires_at` never goes past it |
| `last_used_at` | timestamptz | |
| `is_active` | boolean, default true | false on logout or revocation |
| `created_at`, `updated_at` | timestamptz | with the `updated_at` trigger |
| `created_by`, `updated_by` | bigint, FK `users` | the session's own user; `updated_by` is the admin when the admin revokes it |

Index on `user_id`. DELETE and TRUNCATE triggers.

**`login_attempts`** (insert only):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | |
| `email` | text, not null | lowercase, as typed |
| `ip` | text, not null | |
| `user_id` | bigint, FK `users`, nullable | null when the email is unknown |
| `succeeded` | boolean, not null | |
| `created_at` | timestamptz, default now() | |

Exception to ADR 0004: no `is_active`, `updated_at`, `created_by` or `updated_by`, because rows are never changed and a failed attempt has no user. Indexes on (`email`, `ip`, `created_at`) and (`ip`, `created_at`). `delta_app` gets INSERT and SELECT only, no UPDATE. DELETE and TRUNCATE triggers.

## Login limits

- 5 failures per email + IP in 15 minutes, or 30 failures per IP in 15 minutes, returns 429.
- No lockout by email alone, so nobody can lock the admin out with wrong attempts.
- Every failure returns the same message, "Invalid email or password"; an unknown user gets a dummy bcrypt check so timing reveals nothing.

## Login flow (exact order)

1. Check the limits first. Over the limit: 429, the password is not checked and no attempt is recorded.
2. Unknown email, inactive user or wrong password: record a failed attempt, return 401 "Invalid email or password".
3. Success: record a successful attempt, set `last_login_at`, create the session, and return the token plus the user and the permission names. The app stores the token and opens Home.

On every later request:

- Valid session: slide the expiry (max 90 days from login) and continue.
- Missing, unknown, expired or inactive session, or inactive user: 401, the app goes back to login.
- Logged in without the permission: 403, the app shows "No access".

## Guard (deny by default)

- Every file in `api/` exports its handler through `protect('can_...', handler)`, `authenticated(handler)` or `publicRoute(handler)`; a test fails if a route has none of them.
- Session, active user, active role and active permissions are read in one query, which also slides the expiry.

| Route | Rule |
| --- | --- |
| `POST /api/auth/login` | public |
| `GET /api/auth/me`, `POST /api/auth/logout` | logged in |
| `/api/calendar` | `can_view_reservation` |
| `/api/apartments` | `can_view_apartment` |
| `/api/users` | `can_view_user` |

- **Field filtering:** without `can_view_apartment_owner_contact` the server does not send `ownerName` and `ownerPhone`; without `can_view_apartment_rent` it does not send `monthlyRentEur`. In `packages/core` these fields become optional and the screens skip them.

## App

- Login screen and protected routes; the session survives app restarts. On start the app calls `GET /api/auth/me` to refresh the user and permissions.
- Tabs by permission (Calendar, Apartments, Users); opening a hidden screen shows "No access".
- Home greets the signed-in user and has "Sign out".
- The API client adds the token; a 401 sends the user back to login.
- `AuthProvider` is temporary (becomes `AuthVM` in the ViewModels task).
- After this, no endpoint is public except login; KNOWN_ISSUES 17 and 19 close.

## Details to get right

- **IP address on Vercel:** read it from the `x-forwarded-for` header (first value); locally fall back to the socket address.
- **Revocation is mostly automatic:** every request checks the active user, role and permissions, so deactivating a user or changing a role's permissions takes effect on the next request.
- **System users cannot log in:** `dev-seed@system.local` is inactive and has no valid hash; a test checks that its login fails like any other.
- **Web:** no web app yet, so the httpOnly cookie is out of scope; only the Bearer header is built.

## Order (one commit each)

1. **A.** Migration: `sessions` and `login_attempts` with delete triggers; extend the permissions test.
2. **B.** Login, me, logout, login limits; tests (wrong password, inactive user, 429, expired, cap 90 days).
3. **C.** Guard, completeness test, role × endpoint matrix.
4. **D.** Field filtering in `/api/apartments`, optional fields in core.
5. **E.** App: login, SecureStore, tabs by permission, "No access", Sign out.
6. **F.** Docs: ADR 0008 (authentication), KNOWN_ISSUES, TODO, CLAUDE.md.

Then subtasks 5 and 6 of the users brief (create and edit users, Manage roles).

**Out of scope:** users changing their own password (admin resets it), 2FA, mail, the web cookie.

**Also from the last report:** add tests for the `api/` handlers themselves, and run lint once.
