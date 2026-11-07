import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nightsBetween } from '../packages/core/src/models/date.ts';
import { DEV_APARTMENTS, SEED_MARKER, buildDevReservations } from './seed-data.mjs';

const PHONE = /^[+]?[0-9]{6,15}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNELS = ['direct', 'booking', 'airbnb', 'local_agency'];

// ---- apartments: must satisfy the table's check constraints so the seed cannot fail halfway ----

test('seed apartments have unique names and are marked as seed data', () => {
  const names = DEV_APARTMENTS.map((a) => a.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(DEV_APARTMENTS.length, 3);
  assert.equal(SEED_MARKER, 'dev-seed');
});

test('seed apartments use real calendar names', () => {
  assert.deepEqual(DEV_APARTMENTS.map((a) => a.name), ['Atlas', 'Berlin', 'Devetka']);
});

test('seed apartments satisfy the schema checks (area > 0, rent >= 0, phone format)', () => {
  for (const a of DEV_APARTMENTS) {
    assert.ok(a.area_m2 > 0, a.name);
    assert.ok(a.monthly_rent_eur >= 0, a.name);
    assert.match(a.owner_phone, PHONE, a.name);
    for (const k of ['address', 'apartment_number', 'building_name', 'owner_name']) assert.ok(a[k], `${a.name}.${k}`);
    assert.ok(Number.isInteger(a.floor), a.name);
  }
});

// ---- reservations: laid out relative to a given "today" ----

// Several anchors, including a DST change (2027-03-28) and a month/year boundary.
const TODAYS = ['2026-11-07', '2026-12-28', '2027-03-26', '2028-02-27'];

test('ten reservations over the three seed apartments', () => {
  const res = buildDevReservations('2026-11-07');
  assert.equal(res.length, 10);
  const apartmentNames = new Set(DEV_APARTMENTS.map((a) => a.name));
  for (const r of res) assert.ok(apartmentNames.has(r.apartment_name), r.apartment_name);
  assert.deepEqual([...new Set(res.map((r) => r.apartment_name))].sort(), ['Atlas', 'Berlin', 'Devetka']);
});

test('every reservation satisfies the schema checks, for any "today"', () => {
  for (const today of TODAYS) {
    for (const r of buildDevReservations(today)) {
      const label = `${today} ${r.apartment_name} ${r.guest_name}`;
      assert.match(r.check_in_date, ISO_DATE, label);
      assert.match(r.check_out_date, ISO_DATE, label);
      assert.ok(r.check_out_date > r.check_in_date, `${label}: check-out after check-in`);
      assert.match(r.guest_phone, PHONE, label);
      assert.ok(CHANNELS.includes(r.channel), label);
      assert.ok(r.guest_name.length > 0, label);
      assert.match(r.total_amount_eur, /^\d+\.\d{2}$/, label);
      assert.ok(Number(r.total_amount_eur) >= 0, label);
    }
  }
});

test('no two reservations of the same apartment overlap, for any "today"', () => {
  for (const today of TODAYS) {
    const res = buildDevReservations(today);
    for (const a of res) {
      for (const b of res) {
        if (a === b || a.apartment_name !== b.apartment_name) continue;
        const overlap = a.check_in_date < b.check_out_date && a.check_out_date > b.check_in_date;
        assert.equal(overlap, false, `${today}: ${a.guest_name} overlaps ${b.guest_name} in ${a.apartment_name}`);
      }
    }
  }
});

test('the set is varied: in progress, same-day changeovers, short and long stays, every channel', () => {
  const today = '2026-11-07';
  const res = buildDevReservations(today);
  assert.ok(res.some((r) => r.check_in_date < today && r.check_out_date > today), 'a stay in progress');
  const changeover = res.some((a) => res.some((b) => a !== b && a.apartment_name === b.apartment_name && a.check_out_date === b.check_in_date));
  assert.ok(changeover, 'a same-day changeover');
  const nights = res.map((r) => nightsBetween(r.check_in_date, r.check_out_date));
  assert.ok(Math.min(...nights) <= 3 && Math.max(...nights) >= 7, 'short and long stays');
  assert.deepEqual([...new Set(res.map((r) => r.channel))].sort(), [...CHANNELS].sort());
  assert.ok(res.every((r) => r.check_out_date > today), 'all stays are current or upcoming');
});

test('amounts are nights times the apartment rate', () => {
  const res = buildDevReservations('2026-11-07');
  const atlas = res.find((r) => r.guest_name === 'Marko Jovanović');
  assert.equal(atlas.total_amount_eur, '220.00'); // 4 nights x 55
  const berlin = res.find((r) => r.guest_name === 'Anna Becker');
  assert.equal(berlin.total_amount_eur, '980.00'); // 14 nights x 70
});
