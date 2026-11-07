import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadApartmentDetails, loadApartments, loadCalendar } from './_pgReads.js';
import { PG_FREES_DATES } from './_status.js';

// A fake SQL client: records every query and answers from a queue keyed by a fragment of the SQL.
function fakeSql(answers) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      for (const [fragment, rows] of Object.entries(answers)) if (text.includes(fragment)) return rows;
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

test('loadApartments returns string ids, ordered by name, active only', async () => {
  const sql = fakeSql({ 'from apartments': [{ id: '2', name: 'Atlas' }, { id: '3', name: 'Berlin' }] });
  assert.deepEqual(await loadApartments(sql), [
    { id: '2', name: 'Atlas' },
    { id: '3', name: 'Berlin' },
  ]);
  const text = sql.calls[0].text;
  assert.match(text, /id::text as id/);
  assert.match(text, /where is_active/);
  assert.match(text, /order by name/);
});

test('loadCalendar maps rows to the response the clients parse', async () => {
  const sql = fakeSql({
    'select id::text as id, name from apartments': [{ id: '2', name: 'Atlas' }],
    'from reservations r': [
      { guest_name: 'Marko', apartment_id: '2', check_in: '2026-11-05', check_out: '2026-11-09' },
      { guest_name: null, apartment_id: '2', check_in: '2026-11-12', check_out: '2026-11-14' },
    ],
  });
  const data = await loadCalendar(sql, { start: '2026-11-01', end: '2026-12-01' });
  assert.deepEqual(data.apartments, [{ id: '2', name: 'Atlas' }]);
  assert.deepEqual(data.reservations, [
    { guest: 'Marko', apartments: ['2'], checkIn: '2026-11-05', checkOut: '2026-11-09' },
    { guest: '', apartments: ['2'], checkIn: '2026-11-12', checkOut: '2026-11-14' },
  ]);
});

test('loadCalendar passes values as parameters and filters like the business rules say', async () => {
  const sql = fakeSql({
    'select id::text as id, name from apartments': [],
    'from reservations r': [],
  });
  await loadCalendar(sql, { start: '2026-11-01', end: '2026-12-01' });
  const q = sql.calls.find((c) => c.text.includes('from reservations r'));

  // Parameters, never string interpolation.
  assert.deepEqual(q.params, [PG_FREES_DATES, '2026-12-01', '2026-11-01']);
  assert.doesNotMatch(q.text, /2026-1[12]-01/);

  // Overlap with the month: check-in before the end, check-out after the start.
  assert.match(q.text, /r\.check_in_date < \$2::date/);
  assert.match(q.text, /r\.check_out_date > \$3::date/);
  // Cancelled and no-show free the dates (deny-list); deactivated rows are ignored.
  assert.match(q.text, /r\.status::text <> all\(\$1::text\[\]\)/);
  assert.deepEqual([...PG_FREES_DATES], ['cancelled', 'no_show']);
  assert.match(q.text, /a\.is_active/);
  assert.match(q.text, /r\.is_active/);
  // Dates come back as text, so the driver cannot turn them into shifted JS Dates.
  assert.match(q.text, /r\.check_in_date::text as check_in/);
  assert.match(q.text, /r\.check_out_date::text as check_out/);
});

test('loadApartmentDetails maps every column to the camelCase wire format', async () => {
  const sql = fakeSql({
    'from apartments': [
      {
        id: '4', name: 'Egzotik', address: 'Test Street 4, Belgrade', apartment_number: '4C', floor: 1,
        building_name: 'Lala', area_m2: 41, owner_name: 'Test Owner Four', owner_phone: '+38160000004',
        monthly_rent_eur: 380, has_bathtub: false, has_terrace: false, has_dishwasher: true, parking_spot: null,
      },
      {
        id: '5', name: 'Eli', address: 'Test Street 5, Belgrade', apartment_number: '5', floor: 2,
        building_name: 'Mimoza', area_m2: 33, owner_name: 'Test Owner Five', owner_phone: '+38160000005',
        monthly_rent_eur: 300, has_bathtub: true, has_terrace: false, has_dishwasher: false, parking_spot: 'P5',
      },
    ],
  });
  const list = await loadApartmentDetails(sql);
  assert.deepEqual(list[0], {
    id: '4', name: 'Egzotik', address: 'Test Street 4, Belgrade', apartmentNumber: '4C', floor: 1,
    buildingName: 'Lala', areaM2: 41, ownerName: 'Test Owner Four', ownerPhone: '+38160000004',
    monthlyRentEur: 380, hasBathtub: false, hasTerrace: false, hasDishwasher: true, parkingSpot: null,
  });
  assert.equal(list[1].parkingSpot, 'P5');
  assert.equal(list.length, 2);

  const text = sql.calls[0].text;
  assert.match(text, /id::text as id/);
  assert.match(text, /where is_active/);
  assert.match(text, /order by name/);
  assert.deepEqual(sql.calls[0].params ?? [], []);
});
