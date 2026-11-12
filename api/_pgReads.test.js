import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apartmentFieldAccess, loadApartmentDetails, loadApartments, loadCalendar, loadPermissionNames, loadRoles, loadRolesWithPermissions, loadUser, loadUsers } from './_pgReads.js';
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
  const list = await loadApartmentDetails(sql, { ownerContact: true, rent: true });
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

// ---- field filtering (owner contact and rent) ----

const fullRow = {
  id: '4', name: 'Egzotik', address: 'Test Street 4, Belgrade', apartment_number: '4C', floor: 1,
  building_name: 'Lala', area_m2: 41, owner_name: 'Test Owner Four', owner_phone: '+38160000004',
  monthly_rent_eur: 380, has_bathtub: false, has_terrace: false, has_dishwasher: true, parking_spot: null,
};

test('without any permission there are no owner and no rent fields, and they are not even selected', async () => {
  const sql = fakeSql({ 'from apartments': [fullRow] }); // even if the database returned them
  const [a] = await loadApartmentDetails(sql);
  assert.equal('ownerName' in a, false);
  assert.equal('ownerPhone' in a, false);
  assert.equal('monthlyRentEur' in a, false);
  assert.doesNotMatch(sql.calls[0].text, /owner_name|owner_phone|monthly_rent_eur/);
  assert.doesNotMatch(JSON.stringify(a), /Test Owner|38160000004|380/);
  assert.equal(a.name, 'Egzotik'); // the rest is still there
});

test('can_view_apartment_owner_contact adds exactly ownerName and ownerPhone', async () => {
  const sql = fakeSql({ 'from apartments': [fullRow] });
  const [a] = await loadApartmentDetails(sql, { ownerContact: true });
  assert.equal(a.ownerName, 'Test Owner Four');
  assert.equal(a.ownerPhone, '+38160000004');
  assert.equal('monthlyRentEur' in a, false);
  assert.match(sql.calls[0].text, /owner_name, owner_phone/);
  assert.doesNotMatch(sql.calls[0].text, /monthly_rent_eur/);
});

test('can_view_apartment_rent adds exactly monthlyRentEur', async () => {
  const sql = fakeSql({ 'from apartments': [fullRow] });
  const [a] = await loadApartmentDetails(sql, { rent: true });
  assert.equal(a.monthlyRentEur, 380);
  assert.equal('ownerName' in a, false);
  assert.equal('ownerPhone' in a, false);
  assert.doesNotMatch(sql.calls[0].text, /owner_name|owner_phone/);
});

test('apartmentFieldAccess reads the two permissions from the session', () => {
  assert.deepEqual(apartmentFieldAccess([]), { ownerContact: false, rent: false });
  assert.deepEqual(apartmentFieldAccess(undefined), { ownerContact: false, rent: false });
  assert.deepEqual(apartmentFieldAccess(['can_view_apartment']), { ownerContact: false, rent: false });
  assert.deepEqual(apartmentFieldAccess(['can_view_apartment_rent']), { ownerContact: false, rent: true });
  assert.deepEqual(apartmentFieldAccess(['can_view_apartment_owner_contact']), { ownerContact: true, rent: false });
  assert.deepEqual(
    apartmentFieldAccess(['can_view_apartment_owner_contact', 'can_view_apartment_rent']),
    { ownerContact: true, rent: true },
  );
});

// ---- users ----

const userRow = {
  id: '5',
  email: 'owner@example.com',
  first_name: 'Ana',
  last_name: 'Petrovic',
  phone: null,
  role: 'admin',
  is_active: true,
  last_login_at: null,
};

test('loadUsers maps rows to camelCase with the role name', async () => {
  const sql = fakeSql({
    'from users u': [userRow, { ...userRow, id: '7', role: 'manager', phone: '+381601234567', is_active: false, last_login_at: new Date('2026-11-08T10:00:00Z') }],
  });
  assert.deepEqual(await loadUsers(sql), [
    { id: '5', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: null, role: 'admin', isActive: true, lastLoginAt: null },
    { id: '7', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: '+381601234567', role: 'manager', isActive: false, lastLoginAt: '2026-11-08T10:00:00.000Z' },
  ]);
});

test('loadUsers never selects or returns a password hash', async () => {
  // Even if the database row somehow carried the hash, the mapping copies fields one by one.
  const sql = fakeSql({ 'from users u': [{ ...userRow, password_hash: '$2b$12$secret', passwordHash: '$2b$12$secret' }] });
  const users = await loadUsers(sql);

  assert.doesNotMatch(sql.calls[0].text, /password/i);
  assert.doesNotMatch(sql.calls[0].text, /select\s+\*/i);
  assert.doesNotMatch(JSON.stringify(users), /password|secret|\$2b/i);
  assert.deepEqual(Object.keys(users[0]).sort(), [
    'email', 'firstName', 'id', 'isActive', 'lastLoginAt', 'lastName', 'phone', 'role',
  ]);
});

test('loadUsers keeps inactive users but leaves out system users', async () => {
  const sql = fakeSql({ 'from users u': [] });
  await loadUsers(sql);
  const text = sql.calls[0].text;
  assert.doesNotMatch(text, /where[^;]*is_active/);
  assert.match(text, /not like '%@system\.local'/);
});

test('loadUser maps one row by id, never selects a password hash, and is null when there is none', async () => {
  const sql = fakeSql({ 'from users u': [{ ...userRow, password_hash: '$2b$12$secret' }] });
  const user = await loadUser(sql, '5');
  assert.deepEqual(Object.keys(user).sort(), ['email', 'firstName', 'id', 'isActive', 'lastLoginAt', 'lastName', 'phone', 'role']);
  assert.doesNotMatch(JSON.stringify(user), /password|secret|\$2b/i);
  assert.doesNotMatch(sql.calls[0].text, /password/i);
  assert.match(sql.calls[0].text, /u\.id = \$1::bigint/);
  assert.match(sql.calls[0].text, /not like '%@system\.local'/);
  assert.deepEqual(sql.calls[0].params, ['5']);
  assert.equal(await loadUser(fakeSql({ 'from users u': [] }), '99'), null);
});

test('loadRoles returns the active roles as id and name', async () => {
  const sql = fakeSql({ 'from roles': [{ id: '1', name: 'admin', description: 'x' }, { id: '2', name: 'manager' }] });
  assert.deepEqual(await loadRoles(sql), [{ id: '1', name: 'admin' }, { id: '2', name: 'manager' }]);
  assert.match(sql.calls[0].text, /where is_active/);
});

test('loadPermissionNames returns the names of the active permissions in creation order', async () => {
  const sql = fakeSql({ 'from permissions where is_active': [{ name: 'can_view_user' }, { name: 'can_edit_user' }] });
  assert.deepEqual(await loadPermissionNames(sql), ['can_view_user', 'can_edit_user']);
  assert.match(sql.calls[0].text, /order by id/);
});

test('loadRolesWithPermissions maps each role with its permission names, counting only active links to active permissions', async () => {
  const sql = fakeSql({
    'group by r.id': [
      { id: '1', name: 'admin', is_protected: true, permissions: ['can_view_user', 'can_edit_user'] },
      { id: '4', name: 'cleaning_lady', is_protected: false, permissions: null },
    ],
  });
  assert.deepEqual(await loadRolesWithPermissions(sql), [
    { id: '1', name: 'admin', isProtected: true, permissions: ['can_view_user', 'can_edit_user'] },
    { id: '4', name: 'cleaning_lady', isProtected: false, permissions: [] },
  ]);
  const { text, params } = sql.calls[0];
  assert.match(text, /filter \(where rp\.is_active and p\.is_active\)/);
  assert.match(text, /where r\.is_active\s+group by r\.id/);
  assert.deepEqual(params, []);
});

test('loadRolesWithPermissions with an id asks for that one role, by parameter', async () => {
  const sql = fakeSql({ 'group by r.id': [{ id: '2', name: 'manager', is_protected: false, permissions: [] }] });
  await loadRolesWithPermissions(sql, '2');
  assert.match(sql.calls[0].text, /and r\.id = \$1::bigint/);
  assert.deepEqual(sql.calls[0].params, ['2']);
});
