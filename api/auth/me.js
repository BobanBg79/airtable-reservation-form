import { handleMe } from '../_authHandlers.js';
import { authenticated } from '../_guard.js';

// GET /api/auth/me: the signed-in user and permissions. Any signed-in user.
export default authenticated(handleMe);
