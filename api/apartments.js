const BASE = process.env.AIRTABLE_BASE;
const TOKEN = process.env.AIRTABLE_TOKEN;

export default async function handler(req, res) {
  const url = `https://api.airtable.com/v0/${BASE}/Apartments?fields[]=Name&sort[0][field]=Name`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) return res.status(500).json({ error: 'Airtable error' });
  const data = await r.json();
  res.json(data.records.map(x => ({ id: x.id, name: x.fields.Name })));
}
