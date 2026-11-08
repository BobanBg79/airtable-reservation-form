import { protect } from './_guard.js';
import { loadCalendar } from './_pgReads.js';

// GET /api/calendar?month=YYYY-MM: active apartments plus the reservations that block dates in the month.
// Needs can_view_reservation.
export default protect('can_view_reservation', async function handler(req, res, { sql }) {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
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
});
