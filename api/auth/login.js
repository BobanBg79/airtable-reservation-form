import { handleLogin } from '../_authHandlers.js';
import { publicRoute } from '../_guard.js';

// POST /api/auth/login: checks email and password and starts a session. PUBLIC: it is how you sign in.
export default publicRoute((req, res, { sql }) => handleLogin(req, res, sql));
