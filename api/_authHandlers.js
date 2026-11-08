// The logic of the three auth routes, with the SQL client passed in (the route files in api/auth/ are thin
// adapters). Kept apart so the handlers can be tested without a database connection.
import { performLogin } from './_login.js';
import { getClientIp } from './_loginLimits.js';
import { bearerToken, resolveSession, revokeSession, sessionPayload } from './_sessions.js';

const UNAUTHORIZED = { error: 'Not signed in.' };

function allow(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  res.status(405).json({ error: 'Method not allowed.' });
  return false;
}

/** The JSON body as an object (Vercel parses it; a string is parsed here), or {} when there is none. */
function bodyOf(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      const parsed = JSON.parse(b);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function fail(res, label, e) {
  console.error(`${label} failed:`, e.message); // names only: never a connection string, token or password
  res.status(500).json({ error: 'Something went wrong. Try again.' });
}

/** POST /api/auth/login { email, password } -> { token, user, permissions, expiresAt } */
export async function handleLogin(req, res, sql) {
  if (!allow(req, res, 'POST')) return;
  try {
    const { email, password } = bodyOf(req);
    const result = await performLogin(sql, { email, password, ip: getClientIp(req) });
    res.setHeader('Cache-Control', 'no-store');
    for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
    res.status(result.status).json(result.body);
  } catch (e) {
    fail(res, 'login', e);
  }
}

/** GET /api/auth/me: the signed-in user with the current permissions (refreshes the session expiry). */
export async function handleMe(req, res, sql) {
  if (!allow(req, res, 'GET')) return;
  try {
    const session = await resolveSession(sql, bearerToken(req));
    res.setHeader('Cache-Control', 'no-store');
    if (!session) return void res.status(401).json(UNAUTHORIZED);
    res.status(200).json(sessionPayload(session));
  } catch (e) {
    fail(res, 'me', e);
  }
}

/** POST /api/auth/logout: ends the current session (is_active = false, never a delete). */
export async function handleLogout(req, res, sql) {
  if (!allow(req, res, 'POST')) return;
  try {
    const session = await resolveSession(sql, bearerToken(req));
    res.setHeader('Cache-Control', 'no-store');
    if (!session) return void res.status(401).json(UNAUTHORIZED);
    await revokeSession(sql, session.sessionId, session.user.id);
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, 'logout', e);
  }
}
