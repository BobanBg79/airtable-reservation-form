import { protect } from './_guard.js';
import { loadUsers } from './_pgReads.js';

// GET /api/users: the users with their role, ordered by name. Never contains a password hash.
// Needs can_view_user (admin only by default).
export default protect('can_view_user', async function handler(req, res, { sql }) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadUsers(sql));
  } catch (e) {
    console.error('users failed:', e.message);
    res.status(500).json({ error: 'Could not load users.' });
  }
});
