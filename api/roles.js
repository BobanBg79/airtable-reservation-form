import { handleRoles } from './_dataHandlers.js';
import { protect } from './_guard.js';

// GET /api/roles: the active roles (id and name), for the role dropdown of the user forms. Needs can_view_user
// (admin only by default); the Manage roles screen will get its own permission when it exists.
export default protect('can_view_user', handleRoles);
