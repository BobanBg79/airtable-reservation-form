import { getSql } from './_db.js';
import { loadApartments } from './_pgReads.js';

// GET /api/apartments: active apartments, ordered by name.
export default async function handler(req, res) {
  try {
    res.json(await loadApartments(getSql()));
  } catch (e) {
    console.error('apartments failed:', e.message);
    res.status(500).json({ error: 'Could not load apartments.' });
  }
}
