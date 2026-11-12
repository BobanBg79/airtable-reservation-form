import { handleRolePermissions } from '../_roleHandlers.js';
import { protect } from '../_guard.js';

// GET /api/roles/permissions: every permission, and the roles with the permissions they have. Needs can_view_role
// (admin only by default).
export default protect('can_view_role', handleRolePermissions);
