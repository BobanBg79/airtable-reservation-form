import { protect } from './_guard.js';
import { loadApartmentDetails } from './_pgReads.js';

// GET /api/apartments: active apartments with all their details, ordered by name. Needs can_view_apartment.
// (Owner contact and rent are left out per permission in the next step.)
export default protect('can_view_apartment', async function handler(req, res, { sql }) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadApartmentDetails(sql));
  } catch (e) {
    console.error('apartments failed:', e.message);
    res.status(500).json({ error: 'Could not load apartments.' });
  }
});
