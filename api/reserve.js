const BASE = process.env.AIRTABLE_BASE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const API = `https://api.airtable.com/v0/${BASE}/Reservations`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { guest, apartmentId, checkIn, checkOut, phone, amount, note } = req.body || {};

  if (!guest || !apartmentId || !checkIn || !checkOut)
    return res.status(400).json({ error: 'Guest, apartment and dates are required.' });
  if (checkOut <= checkIn)
    return res.status(400).json({ error: 'Check-out must be after check-in.' });

  // Find non-cancelled bookings whose dates overlap (same-day changeover allowed)
  const formula = `AND({Status}!='Otkazano', IS_BEFORE({Check-in}, '${checkOut}'), IS_AFTER({Check-out}, '${checkIn}'))`;
  const q = `${API}?filterByFormula=${encodeURIComponent(formula)}&fields[]=Guest&fields[]=Apartment&fields[]=Check-in&fields[]=Check-out`;
  const r = await fetch(q, { headers: H });
  if (!r.ok) return res.status(500).json({ error: 'Could not check availability.' });
  const { records } = await r.json();

  const clash = records.find(x => (x.fields.Apartment || []).includes(apartmentId));
  if (clash) {
    const f = clash.fields;
    return res.status(409).json({
      error: `Occupied: ${f.Guest || 'guest'} ${f['Check-in']} to ${f['Check-out']}.`
    });
  }

  const fields = {
    Guest: guest,
    Apartment: [apartmentId],
    'Check-in': checkIn,
    'Check-out': checkOut,
    Status: 'Potvrđeno'
  };
  if (phone) fields.Phone = phone;
  if (amount) fields.Amount = Number(amount);
  if (note) fields.Note = note;

  const c = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ fields }) });
  if (!c.ok) return res.status(500).json({ error: 'Saving failed.' });
  res.json({ ok: true });
}
