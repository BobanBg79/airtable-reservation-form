import { handleEditUser } from '../_userHandlers.js';
import { protect } from '../_guard.js';

// POST /api/users/edit: changes a user (name, phone, role, active or not, a new password). Needs can_edit_user
// (admin only by default). Never returns a password hash.
export default protect('can_edit_user', handleEditUser);
