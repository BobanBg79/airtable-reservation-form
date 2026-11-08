import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL_ROLE_PERMISSIONS } from '../packages/core/src/models/permissions.ts';
import { handleApartments, handleCalendar, handleUsers } from './_dataHandlers.js';
import { fakeRes } from './_fakeSql.js';

const apartmentRow = {
  id: '4', name: 'Egzotik', address: 'Test Street 4, Belgrade', apartment_number: '4C', floor: 1, building_name: 'Lala',
  area_m2: 41, owner_name: 'Test Owner Four', owner_phone: '+38160000004', monthly_rent_eur: 380,
  has_bathtub: false, has_terrace: false, has_dishwasher: true, parking_spot: null,
};

// A database that answers every query with the same rows (and records the queries).
function db(rows) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      return rows;
    },
  };
}
const auth = (role) => ({ sessionId: '1', user: { id: '5' }, permissions: [...INITIAL_ROLE_PERMISSIONS[role]] });
const failing = { query: async () => { throw new Error('boom postgres://u:secret@h'); } };

async function silently(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = original;
  }
}

// ---- /api/apartments: field filtering per role ----

test('apartments: admin and business_owner see owner contact and rent', async () => {
  for (const role of ['admin', 'business_owner']) {
    const res = fakeRes();
    await handleApartments({}, res, { sql: db([apartmentRow]), auth: auth(role) });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].ownerName, 'Test Owner Four', role);
    assert.equal(res.body[0].ownerPhone, '+38160000004', role);
    assert.equal(res.body[0].monthlyRentEur, 380, role);
  }
});

test('apartments: a role without the permissions gets NO owner or rent fields at all', async () => {
  const sql = db([apartmentRow]);
  const res = fakeRes();
  // The admin can adjust role sets, so a manager may have only the view permission.
  await handleApartments({}, res, { sql, auth: { sessionId: '1', user: { id: '9' }, permissions: ['can_view_apartment'] } });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(res.body), /ownerName|ownerPhone|monthlyRentEur|Test Owner|38160000004|380/);
  assert.doesNotMatch(sql.calls[0].text, /owner_name|owner_phone|monthly_rent_eur/);
  assert.equal(res.body[0].name, 'Egzotik');
});

test('apartments: rent and owner contact are independent permissions', async () => {
  const rentOnly = fakeRes();
  await handleApartments({}, rentOnly, { sql: db([apartmentRow]), auth: { permissions: ['can_view_apartment_rent'] } });
  assert.equal(rentOnly.body[0].monthlyRentEur, 380);
  assert.equal('ownerName' in rentOnly.body[0], false);

  const contactOnly = fakeRes();
  await handleApartments({}, contactOnly, { sql: db([apartmentRow]), auth: { permissions: ['can_view_apartment_owner_contact'] } });
  assert.equal(contactOnly.body[0].ownerPhone, '+38160000004');
  assert.equal('monthlyRentEur' in contactOnly.body[0], false);
});

test('apartments: a database failure is a generic 500 that leaks nothing', async () => {
  const res = fakeRes();
  await silently(() => handleApartments({}, res, { sql: failing, auth: auth('admin') }));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not load apartments.' });
});

// ---- /api/calendar ----

test('calendar: uses the requested month and returns it, with no-store caching', async () => {
  const sql = db([]);
  const res = fakeRes();
  await handleCalendar({ query: { month: '2026-11' } }, res, { sql });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.month, '2026-11');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const reservations = sql.calls.find((c) => c.text.includes('from reservations'));
  assert.deepEqual(reservations.params.slice(1), ['2026-12-01', '2026-11-01']); // end, start of the month
});

test('calendar: December rolls over to the next year; a malformed month falls back to the current one', async () => {
  const sql = db([]);
  await handleCalendar({ query: { month: '2026-12' } }, fakeRes(), { sql });
  const q = sql.calls.find((c) => c.text.includes('from reservations'));
  assert.deepEqual(q.params.slice(1), ['2027-01-01', '2026-12-01']);

  const res = fakeRes();
  await handleCalendar({ query: { month: 'nonsense' } }, res, { sql: db([]) });
  assert.match(res.body.month, /^\d{4}-\d{2}$/);
});

test('calendar: a database failure is a generic 500', async () => {
  const res = fakeRes();
  await silently(() => handleCalendar({ query: { month: '2026-11' } }, res, { sql: failing }));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not load calendar.' });
});

// ---- /api/users ----

test('users: returns the users, never a password or hash, even if a row carried one', async () => {
  const row = {
    id: '5', email: 'owner@example.com', first_name: 'Ana', last_name: 'P', phone: null, role: 'admin',
    is_active: true, last_login_at: null, password_hash: '$2b$12$secret',
  };
  const res = fakeRes();
  await handleUsers({}, res, { sql: db([row]) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].email, 'owner@example.com');
  assert.doesNotMatch(JSON.stringify(res.body), /password|secret|\$2b/i);
});

test('users: a database failure is a generic 500', async () => {
  const res = fakeRes();
  await silently(() => handleUsers({}, res, { sql: failing }));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Could not load users.' });
});
