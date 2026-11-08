// The logic of the data routes (calendar, apartments, users), after the guard has let the caller in.
// The SQL client and the caller (`auth`) are passed in, so the handlers can be tested without a database;
// the route files in api/ are thin: `export default protect('can_...', handleX)`.
import { apartmentFieldAccess, loadApartmentDetails, loadCalendar, loadUsers } from './_pgReads.js';

/** GET /api/calendar?month=YYYY-MM: active apartments plus the reservations that block dates in the month. */
export async function handleCalendar(req, res, { sql }) {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query?.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    const data = await loadCalendar(sql, { start, end });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ month, ...data });
  } catch (e) {
    console.error('calendar failed:', e.message); // names only: errors here never carry connection strings
    res.status(500).json({ error: 'Could not load calendar.' });
  }
}

/**
 * GET /api/apartments: active apartments with their details, ordered by name. The server leaves out what the
 * caller may not see: without can_view_apartment_owner_contact there are no ownerName and ownerPhone, without
 * can_view_apartment_rent no monthlyRentEur. They are not even read from the database.
 */
export async function handleApartments(req, res, { sql, auth }) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadApartmentDetails(sql, apartmentFieldAccess(auth.permissions)));
  } catch (e) {
    console.error('apartments failed:', e.message);
    res.status(500).json({ error: 'Could not load apartments.' });
  }
}

/** GET /api/users: the users with their role. Never contains a password hash. */
export async function handleUsers(req, res, { sql }) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadUsers(sql));
  } catch (e) {
    console.error('users failed:', e.message);
    res.status(500).json({ error: 'Could not load users.' });
  }
}
