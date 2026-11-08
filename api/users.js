import { getSql } from './_db.js';
import { loadUsers } from './_pgReads.js';

// GET /api/users: the users with their role, ordered by name. Never contains a password hash.
// TEMPORARILY PUBLIC (KNOWN_ISSUES 19): moves behind can_view_user with the authentication task.
export default async function handler(req, res) {
  try {
    res.json(await loadUsers(getSql()));
  } catch (e) {
    console.error('users failed:', e.message);
    res.status(500).json({ error: 'Could not load users.' });
  }
}
