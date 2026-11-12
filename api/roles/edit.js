import { handleEditRole } from '../_roleHandlers.js';
import { protect } from '../_guard.js';

// POST /api/roles/edit: sets the permissions of a role (never the admin role). Needs can_edit_role (admin only
// by default).
export default protect('can_edit_role', handleEditRole);
