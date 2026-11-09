import { handleCreateUser } from '../_userHandlers.js';
import { protect } from '../_guard.js';

// POST /api/users/create: adds a user. Needs can_create_user (admin only by default). Never returns a password hash.
export default protect('can_create_user', handleCreateUser);
