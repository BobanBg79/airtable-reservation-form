import { handleLogin } from '../_authHandlers.js';
import { getSql } from '../_db.js';

// POST /api/auth/login: checks email and password and starts a session. Public (it is how you sign in).
export default function handler(req, res) {
  return handleLogin(req, res, getSql());
}
