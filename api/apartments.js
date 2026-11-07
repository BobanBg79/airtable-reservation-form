import { getSql } from './_db.js';
import { loadApartmentDetails } from './_pgReads.js';

// GET /api/apartments: active apartments with all their details, ordered by name.
export default async function handler(req, res) {
  try {
    res.json(await loadApartmentDetails(getSql()));
  } catch (e) {
    console.error('apartments failed:', e.message);
    res.status(500).json({ error: 'Could not load apartments.' });
  }
}
