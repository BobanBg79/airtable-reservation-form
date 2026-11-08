// The server guard, deny by default (docs/briefs/authentication.md). Every route file in api/ exports its
// handler through exactly one of:
//
//   protect('can_...', handler)   a signed-in user WITH that permission
//   authenticated(handler)        any signed-in user
//   publicRoute(handler)          nobody has to sign in (login only)
//
// and a test (scripts/api-guard.test.mjs) fails if a route has none of them. Answers:
//   401  no session, an unknown, expired or inactive session, or an inactive user or role: sign in again
//   403  signed in, but the role does not have the permission: the app shows "No access"
// The session, the active user and role, and the active permissions are read in ONE statement (resolveSession),
// which also slides the expiry. Handlers get `(req, res, { sql, auth })`; `auth` is { sessionId, user, permissions }.
//
// This file takes `getSql` as a parameter and has no database import, so tests can use a fake client;
// api/_guard.js wires in the real one.
import { bearerToken, resolveSession } from './_sessions.js';

const NOT_SIGNED_IN = { error: 'Not signed in.' };
const FORBIDDEN = { error: 'You do not have permission to do this.' };

export function makeGuards(getSql) {
  function guarded(permission, handler) {
    const guard = async (req, res) => {
      let sql;
      let auth;
      try {
        sql = getSql();
        auth = await resolveSession(sql, bearerToken(req));
      } catch (e) {
        console.error('auth failed:', e.message); // never a token or a connection string
        return void res.status(500).json({ error: 'Something went wrong. Try again.' });
      }
      if (!auth) {
        res.setHeader('Cache-Control', 'no-store');
        return void res.status(401).json(NOT_SIGNED_IN);
      }
      if (permission && !auth.permissions.includes(permission)) {
        res.setHeader('Cache-Control', 'no-store');
        return void res.status(403).json(FORBIDDEN);
      }
      return handler(req, res, { sql, auth });
    };
    guard.guard = { kind: permission ? 'protect' : 'authenticated', permission: permission ?? null };
    return guard;
  }

  return {
    protect(permission, handler) {
      if (typeof permission !== 'string' || !/^can_(view|create|edit)_[a-z_]+$/.test(permission)) {
        throw new Error(`protect() needs a permission name like can_view_user, got ${String(permission)}.`);
      }
      return guarded(permission, handler);
    },
    authenticated(handler) {
      return guarded(null, handler);
    },
    publicRoute(handler) {
      const guard = (req, res) => handler(req, res, { sql: getSql() });
      guard.guard = { kind: 'public', permission: null };
      return guard;
    },
  };
}
