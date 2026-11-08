import { handleLogout } from '../_authHandlers.js';
import { getSql } from '../_db.js';

// POST /api/auth/logout: ends the current session. Needs a session.
export default function handler(req, res) {
  return handleLogout(req, res, getSql());
}
