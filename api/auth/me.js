import { handleMe } from '../_authHandlers.js';
import { getSql } from '../_db.js';

// GET /api/auth/me: the signed-in user and permissions. Needs a session.
export default function handler(req, res) {
  return handleMe(req, res, getSql());
}
