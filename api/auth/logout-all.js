import { handleLogoutAll } from '../_authHandlers.js';
import { authenticated } from '../_guard.js';

// POST /api/auth/logout-all: ends every session of the signed-in user, this device included. Any signed-in user.
export default authenticated(handleLogoutAll);
