const BASE = process.env.AIRTABLE_BASE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const H = { Authorization: `Bearer ${TOKEN}` };

async function fetchAll(url) {
  let out = [], offset;
  do {
    const r = await fetch(url + (offset ? `&offset=${offset}` : ''), { headers: H });
    if (!r.ok) throw new Error('Airtable error');
    const d = await r.json();
    out = out.concat(d.records);
    offset = d.offset;
  } while (offset);
  return out;
}

export default async function handler(req, res) {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    const apts = await fetchAll(`https://api.airtable.com/v0/${BASE}/Apartments?fields[]=Name&sort[0][field]=Name`);
    const formula = `AND({Status}!='Otkazano', IS_BEFORE({Check-in}, '${end}'), IS_AFTER({Check-out}, '${start}'))`;
    const resv = await fetchAll(`https://api.airtable.com/v0/${BASE}/Reservations?filterByFormula=${encodeURIComponent(formula)}&fields[]=Guest&fields[]=Apartment&fields[]=Check-in&fields[]=Check-out`);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      month,
      apartments: apts.map(a => ({ id: a.id, name: a.fields.Name })),
      reservations: resv.map(r => ({
        guest: r.fields.Guest || '',
        apartments: r.fields.Apartment || [],
        checkIn: r.fields['Check-in'],
        checkOut: r.fields['Check-out']
      }))
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not load calendar.' });
  }
}
