import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPhone } from '../api/_userInput.js';
import { isValidISODate, nightsBetween } from '../packages/core/src/models/date.ts';
import { rangesOverlap } from '../packages/core/src/models/overlap.ts';
import { DEV_APARTMENTS, SEED_BASE_DATE, SEED_USER_EMAIL, buildDevReservations } from './seed-data.mjs';

const CHANNELS = ['direct', 'booking', 'airbnb', 'local_agency'];

// ---- apartments: must satisfy the table's check constraints so the seed cannot fail halfway ----

test('seed apartments have unique names and are marked as seed data', () => {
  const names = DEV_APARTMENTS.map((a) => a.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(DEV_APARTMENTS.length, 9);
  assert.equal(SEED_USER_EMAIL, 'dev-seed@system.local');
});

test('seed apartments are the first nine real apartment names, in order', () => {
  assert.deepEqual(DEV_APARTMENTS.map((a) => a.name), [
    'Atlas', 'Berlin', 'Devetka', 'Egzotik', 'Eli', 'Kapiten', 'Karuzo', 'Luna', 'Margareta',
  ]);
});

test('seed apartments satisfy the schema checks (area > 0, rent >= 0, phone format)', () => {
  for (const a of DEV_APARTMENTS) {
    assert.ok(a.area_m2 > 0, a.name);
    assert.ok(a.monthly_rent_eur >= 0, a.name);
    assert.equal(checkPhone(a.owner_phone).error, undefined, a.name); // the real phone rule of the users table
    for (const k of ['address', 'apartment_number', 'building_name', 'owner_name']) assert.ok(a[k], `${a.name}.${k}`);
    assert.ok(Number.isInteger(a.floor), a.name);
  }
});

test('owner phones are unique and clearly fake', () => {
  const phones = DEV_APARTMENTS.map((a) => a.owner_phone);
  assert.equal(new Set(phones).size, phones.length);
  for (const p of phones) assert.match(p, /^\+3816000000\d$/);
});

// ---- reservations: laid out from a base date ----

// Several base dates, including a DST change (2027-03-28) and a month/year boundary.
const BASES = [SEED_BASE_DATE, '2026-12-28', '2027-03-26', '2028-02-27'];

test('25 reservations over the nine seed apartments, every apartment has some', () => {
  const res = buildDevReservations();
  assert.equal(res.length, 25);
  const names = new Set(DEV_APARTMENTS.map((a) => a.name));
  for (const r of res) assert.ok(names.has(r.apartment_name), r.apartment_name);
  for (const n of names) assert.ok(res.some((r) => r.apartment_name === n), `${n} has a reservation`);
  for (const n of ['Egzotik', 'Eli', 'Kapiten', 'Karuzo', 'Luna', 'Margareta']) {
    assert.ok(res.filter((r) => r.apartment_name === n).length >= 2, `${n} has at least two`);
  }
});

test('the first ten reservations keep their exact dates (they are already in the dev database)', () => {
  // The seed recognises a reservation by apartment, guest and dates. If these change, the seed would
  // add a second copy next to the one already stored. Change them only together with a data reset.
  const first = buildDevReservations(SEED_BASE_DATE)
    .slice(0, 10)
    .map((r) => [r.apartment_name, r.guest_name, r.check_in_date, r.check_out_date]);
  assert.deepEqual(first, [
    ['Atlas', 'Marko Jovanović', '2026-11-05', '2026-11-09'],
    ['Atlas', 'Ivana Petrović', '2026-11-09', '2026-11-13'],
    ['Atlas', 'Stefan Nikolić', '2026-11-16', '2026-11-23'],
    ['Atlas', 'Milica Đorđević', '2026-11-27', '2026-11-30'],
    ['Berlin', 'Luka Stanković', '2026-11-06', '2026-11-10'],
    ['Berlin', 'Jelena Ilić', '2026-11-12', '2026-11-15'],
    ['Berlin', 'Anna Becker', '2026-11-17', '2026-12-01'],
    ['Devetka', 'Nikola Pavlović', '2026-11-08', '2026-11-11'],
    ['Devetka', 'Teodora Marković', '2026-11-11', '2026-11-14'],
    ['Devetka', 'Peter Novak', '2026-11-19', '2026-11-22'],
  ]);
});

test('every reservation satisfies the schema checks, for any base date', () => {
  for (const base of BASES) {
    for (const r of buildDevReservations(base)) {
      const label = `${base} ${r.apartment_name} ${r.guest_name}`;
      // valid dates, and check-out after check-in, by the real date functions of packages/core
      assert.equal(isValidISODate(r.check_in_date), true, label);
      assert.equal(isValidISODate(r.check_out_date), true, label);
      assert.ok(nightsBetween(r.check_in_date, r.check_out_date) > 0, `${label}: check-out after check-in`);
      assert.equal(checkPhone(r.guest_phone).error, undefined, label);
      assert.ok(CHANNELS.includes(r.channel), label);
      assert.ok(r.guest_name.length > 0, label);
      assert.match(r.total_amount_eur, /^\d+\.\d{2}$/, label);
      assert.ok(Number(r.total_amount_eur) >= 0, label);
    }
  }
});

test('no two reservations of the same apartment overlap, for any base date', () => {
  for (const base of BASES) {
    const res = buildDevReservations(base);
    for (const a of res) {
      for (const b of res) {
        if (a === b || a.apartment_name !== b.apartment_name) continue;
        const overlap = rangesOverlap(
          { checkIn: a.check_in_date, checkOut: a.check_out_date },
          { checkIn: b.check_in_date, checkOut: b.check_out_date },
        );
        assert.equal(overlap, false, `${base}: ${a.guest_name} overlaps ${b.guest_name} in ${a.apartment_name}`);
      }
    }
  }
});

test('a reservation can be recognised: apartment, guest and dates are unique', () => {
  for (const base of BASES) {
    const keys = buildDevReservations(base).map((r) => [r.apartment_name, r.guest_name, r.check_in_date, r.check_out_date].join('|'));
    assert.equal(new Set(keys).size, keys.length, base);
  }
  // Guest names are unique within an apartment too, so a rename of the dates never matches the wrong row.
  const res = buildDevReservations();
  const perApartment = res.map((r) => `${r.apartment_name}|${r.guest_name}`);
  assert.equal(new Set(perApartment).size, perApartment.length);
});

test('guest phones are unique and clearly fake', () => {
  const phones = buildDevReservations().map((r) => r.guest_phone);
  assert.equal(new Set(phones).size, phones.length);
  for (const p of phones) assert.match(p, /^\+38160000\d{3}$/);
});

test('the set is varied: in progress, same-day changeovers, short and long stays, every channel, December', () => {
  const base = SEED_BASE_DATE;
  const res = buildDevReservations(base);
  assert.ok(res.some((r) => r.check_in_date < base && r.check_out_date > base), 'a stay in progress');
  assert.ok(res.some((r) => r.check_in_date === base), 'a stay starting on the base day');
  const changeovers = res.filter((a) => res.some((b) => a !== b && a.apartment_name === b.apartment_name && a.check_out_date === b.check_in_date));
  assert.ok(changeovers.length >= 4, 'several same-day changeovers');
  const nights = res.map((r) => nightsBetween(r.check_in_date, r.check_out_date));
  assert.ok(Math.min(...nights) <= 3 && Math.max(...nights) >= 7, 'short and long stays');
  assert.deepEqual([...new Set(res.map((r) => r.channel))].sort(), [...CHANNELS].sort());
  assert.ok(res.some((r) => r.check_in_date >= '2026-12-01'), 'a stay in December');
  assert.ok(res.every((r) => r.check_out_date > base), 'all stays are current or upcoming');
});

test('amounts are nights times the apartment rate', () => {
  const res = buildDevReservations(SEED_BASE_DATE);
  const find = (guest) => res.find((r) => r.guest_name === guest);
  assert.equal(find('Marko Jovanović').total_amount_eur, '220.00'); // Atlas, 4 nights x 55
  assert.equal(find('Anna Becker').total_amount_eur, '980.00'); // Berlin, 14 nights x 70
  assert.equal(find('Vladimir Kostić').total_amount_eur, '560.00'); // Margareta, 7 nights x 80
});
