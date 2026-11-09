// Login sessions (ADR 0008, docs/briefs/authentication.md). Files starting with "_" in api/ are not routes.
//
// A session is a random 32-byte token. Only its SHA-256 hash is stored (`sessions.token_hash`); the token
// itself goes to the client once, at login. The expiry slides: every authenticated request moves it to
// now + 7 days, but never past `max_expires_at` (login + 90 days). Logout sets is_active = false; nothing
// is deleted. Pure functions, the SQL client is passed in so tests can use a fake one.
import { createHash, randomBytes } from 'node:crypto';

export const SLIDING_DAYS = 7;
export const MAX_DAYS = 90;

/** A new random token and the hash that is stored for it. */
export function generateToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** The token of an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(req) {
  const header = req.headers?.authorization;
  const m = typeof header === 'string' ? /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header) : null;
  return m ? m[1] : null;
}

/** The query that creates a session (returned as is so it can run inside `sql.transaction`). */
export function createSessionQuery(sql, userId, tokenHash) {
  return sql.query(
    `insert into sessions (user_id, token_hash, expires_at, max_expires_at, last_used_at, created_by, updated_by)
     values ($1::bigint, $2, now() + make_interval(days => $3::int), now() + make_interval(days => $4::int), now(), $1::bigint, $1::bigint)`,
    [userId, tokenHash, SLIDING_DAYS, MAX_DAYS],
  );
}

/**
 * Checks a token and slides its expiry, all in ONE statement. Returns the session with its user, role and
 * permission names, or null when the token is unknown, expired or inactive, or the user or role is inactive.
 * Because the user, role and permissions are read on every request, deactivating a user or changing a role's
 * permissions takes effect on the next request.
 */
export async function resolveSession(sql, token) {
  if (typeof token !== 'string' || token === '') return null;
  const rows = await sql.query(
    `with touched as (
       update sessions s
          set expires_at = least(now() + make_interval(days => $2::int), s.max_expires_at),
              last_used_at = now(),
              updated_by = s.user_id
         from users u
         join roles r on r.id = u.role_id
        where s.token_hash = $1
          and s.is_active
          and s.expires_at > now()
          and u.id = s.user_id
          and u.is_active
          and r.is_active
        returning s.id as session_id, s.expires_at, u.id as user_id, u.email, u.first_name, u.last_name,
                  u.role_id, r.name as role
     )
     select t.session_id::text as session_id, t.expires_at, t.user_id::text as user_id, t.email,
            t.first_name, t.last_name, t.role,
            coalesce((select array_agg(p.name order by p.name)
                        from role_permissions rp
                        join permissions p on p.id = rp.permission_id
                       where rp.role_id = t.role_id and rp.is_active and p.is_active), '{}'::text[]) as permissions
       from touched t`,
    [hashToken(token), SLIDING_DAYS],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    sessionId: r.session_id,
    expiresAt: new Date(r.expires_at).toISOString(),
    user: { id: r.user_id, email: r.email, firstName: r.first_name, lastName: r.last_name, role: r.role },
    permissions: r.permissions ?? [],
  };
}

/** Ends a session (logout or revocation): is_active = false, never a delete. `byUserId` is who did it. */
export async function revokeSession(sql, sessionId, byUserId) {
  await sql.query('update sessions set is_active = false, updated_by = $2::bigint where id = $1::bigint and is_active', [
    sessionId,
    byUserId,
  ]);
}

/** What the clients get after login and from /api/auth/me. */
export function sessionPayload(session) {
  return { user: session.user, permissions: session.permissions, expiresAt: session.expiresAt };
}
