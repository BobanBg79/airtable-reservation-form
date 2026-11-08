import { handleUsers } from './_dataHandlers.js';
import { protect } from './_guard.js';

// GET /api/users. Needs can_view_user (admin only by default). Never contains a password hash.
export default protect('can_view_user', handleUsers);
