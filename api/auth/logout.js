import { handleLogout } from '../_authHandlers.js';
import { authenticated } from '../_guard.js';

// POST /api/auth/logout: ends the current session. Any signed-in user.
export default authenticated(handleLogout);
