// Fake data for the Neon DEV branch only. Only the apartment names are meaningful: they are real
// apartment names shown by the calendar screen (apps/mobile MonthGrid reads `name`; colours derive
// from it). Everything else is made up. Never put real owner phone numbers, addresses or guests here.
import { addDays, nightsBetween } from '../packages/core/src/models/date.ts';

// Email of the system user that owns every seeded row (created_by / updated_by). It is created by migration
// 0005, cannot sign in, and is how the seed recognises its own rows (the columns are foreign keys to users).
export const SEED_USER_EMAIL = 'dev-seed@system.local';

// All reservation dates are laid out from this fixed day (it was "today" when the data was written).
// A fixed day keeps the seed idempotent: a reservation is recognised by apartment, guest and dates,
// so running again adds only what is missing and never creates overlaps. The data ages: when it is
// all in the past, deactivate the old seed reservations and move this date forward (see "Dev reset" in docs/database-migrations.md).
export const SEED_BASE_DATE = '2026-11-07';

// The first nine of the real apartments, in alphabetical order. "Margareta" is deliberately in the
// set: it is long enough to show how the name column handles longer names.
export const DEV_APARTMENTS = [
  {
    name: 'Atlas',
    address: 'Test Street 1, Belgrade',
    apartment_number: '1A',
    floor: 0,
    building_name: 'Mimoza',
    area_m2: 38,
    owner_name: 'Test Owner One',
    owner_phone: '+38160000001',
    monthly_rent_eur: 350,
    has_bathtub: false,
    has_terrace: true,
    has_dishwasher: false,
    parking_spot: null,
  },
  {
    name: 'Berlin',
    address: 'Test Street 2, Belgrade',
    apartment_number: '12B',
    floor: 3,
    building_name: 'Suncokret',
    area_m2: 52,
    owner_name: 'Test Owner Two',
    owner_phone: '+38160000002',
    monthly_rent_eur: 480,
    has_bathtub: true,
    has_terrace: false,
    has_dishwasher: true,
    parking_spot: 'P12',
  },
  {
    name: 'Devetka',
    address: 'Test Street 3, Belgrade',
    apartment_number: '9',
    floor: 9,
    building_name: 'Lala',
    area_m2: 45,
    owner_name: 'Test Owner Three',
    owner_phone: '+38160000003',
    monthly_rent_eur: 420,
    has_bathtub: true,
    has_terrace: true,
    has_dishwasher: false,
    parking_spot: null,
  },
  {
    name: 'Egzotik',
    address: 'Test Street 4, Belgrade',
    apartment_number: '4C',
    floor: 1,
    building_name: 'Lala',
    area_m2: 41,
    owner_name: 'Test Owner Four',
    owner_phone: '+38160000004',
    monthly_rent_eur: 380,
    has_bathtub: false,
    has_terrace: false,
    has_dishwasher: true,
    parking_spot: null,
  },
  {
    name: 'Eli',
    address: 'Test Street 5, Belgrade',
    apartment_number: '5',
    floor: 2,
    building_name: 'Mimoza',
    area_m2: 33,
    owner_name: 'Test Owner Five',
    owner_phone: '+38160000005',
    monthly_rent_eur: 300,
    has_bathtub: true,
    has_terrace: false,
    has_dishwasher: false,
    parking_spot: 'P5',
  },
  {
    name: 'Kapiten',
    address: 'Test Street 6, Belgrade',
    apartment_number: '6A',
    floor: 5,
    building_name: 'Suncokret',
    area_m2: 58,
    owner_name: 'Test Owner Six',
    owner_phone: '+38160000006',
    monthly_rent_eur: 520,
    has_bathtub: true,
    has_terrace: true,
    has_dishwasher: true,
    parking_spot: 'P6',
  },
  {
    name: 'Karuzo',
    address: 'Test Street 7, Belgrade',
    apartment_number: '7',
    floor: 0,
    building_name: 'Lala',
    area_m2: 36,
    owner_name: 'Test Owner Seven',
    owner_phone: '+38160000007',
    monthly_rent_eur: 320,
    has_bathtub: false,
    has_terrace: true,
    has_dishwasher: false,
    parking_spot: null,
  },
  {
    name: 'Luna',
    address: 'Test Street 8, Belgrade',
    apartment_number: '8B',
    floor: 4,
    building_name: 'Mimoza',
    area_m2: 47,
    owner_name: 'Test Owner Eight',
    owner_phone: '+38160000008',
    monthly_rent_eur: 430,
    has_bathtub: true,
    has_terrace: false,
    has_dishwasher: true,
    parking_spot: null,
  },
  {
    name: 'Margareta',
    address: 'Test Street 9, Belgrade',
    apartment_number: '9',
    floor: 7,
    building_name: 'Suncokret',
    area_m2: 62,
    owner_name: 'Test Owner Nine',
    owner_phone: '+38160000009',
    monthly_rent_eur: 560,
    has_bathtub: true,
    has_terrace: true,
    has_dishwasher: true,
    parking_spot: 'P9',
  },
];

// Price per night (EUR) used to make up a total for each apartment.
const NIGHTLY_RATE_EUR = {
  Atlas: 55,
  Berlin: 70,
  Devetka: 60,
  Egzotik: 65,
  Eli: 50,
  Kapiten: 75,
  Karuzo: 58,
  Luna: 62,
  Margareta: 80,
};

// Twenty-five reservations, laid out in days from the base date. The set is deliberately varied:
// stays in progress, one starting on the base day, same-day changeovers (a check-out on the day
// another guest checks in), short and long stays, all four channels, and stays that run into December.
// No two reservations of the same apartment overlap (the database does not enforce that yet), and
// every guest name is unique within its apartment, which is what makes a reservation recognisable.
// The first ten rows were seeded earlier and must keep their exact dates (a test pins them).
const PLAN = [
  // [apartment, check-in offset, check-out offset, channel, guest, phone]
  ['Atlas', -2, 2, 'direct', 'Marko Jovanović', '+38160000101'], // in progress
  ['Atlas', 2, 6, 'booking', 'Ivana Petrović', '+38160000102'], // same-day changeover with the stay above
  ['Atlas', 9, 16, 'airbnb', 'Stefan Nikolić', '+38160000103'],
  ['Atlas', 20, 23, 'local_agency', 'Milica Đorđević', '+38160000104'],
  ['Berlin', -1, 3, 'booking', 'Luka Stanković', '+38160000105'], // in progress
  ['Berlin', 5, 8, 'direct', 'Jelena Ilić', '+38160000106'],
  ['Berlin', 10, 24, 'airbnb', 'Anna Becker', '+38160000107'], // two weeks, runs into December
  ['Devetka', 1, 4, 'direct', 'Nikola Pavlović', '+38160000108'],
  ['Devetka', 4, 7, 'local_agency', 'Teodora Marković', '+38160000109'], // same-day changeover
  ['Devetka', 12, 15, 'booking', 'Peter Novak', '+38160000110'],

  ['Berlin', 26, 30, 'direct', 'Miloš Todorović', '+38160000111'], // December
  ['Devetka', -4, 1, 'direct', 'Ana Marić', '+38160000112'], // in progress, hands over to Nikola Pavlović
  ['Egzotik', -3, 1, 'booking', 'Sofia Rossi', '+38160000113'], // in progress
  ['Egzotik', 3, 10, 'airbnb', 'Hans Müller', '+38160000114'],
  ['Eli', 0, 4, 'direct', 'Dragana Simić', '+38160000115'], // starts on the base day
  ['Eli', 7, 10, 'local_agency', 'Vuk Lazić', '+38160000116'],
  ['Kapiten', -5, 3, 'airbnb', 'Emma Wilson', '+38160000117'], // in progress, eight nights
  ['Kapiten', 3, 6, 'direct', 'Bogdan Ristić', '+38160000118'], // same-day changeover
  ['Kapiten', 14, 21, 'booking', 'Lucas Martin', '+38160000119'],
  ['Karuzo', 2, 5, 'local_agency', 'Katarina Popović', '+38160000120'],
  ['Karuzo', 8, 12, 'direct', 'Đorđe Vasić', '+38160000121'],
  ['Luna', -1, 5, 'booking', 'Olga Ivanova', '+38160000122'], // in progress
  ['Luna', 11, 18, 'airbnb', 'Giulia Bianchi', '+38160000123'],
  ['Margareta', 1, 8, 'direct', 'Vladimir Kostić', '+38160000124'],
  ['Margareta', 8, 11, 'booking', 'Sara Cohen', '+38160000125'], // same-day changeover
];

/** The dev reservations for a given base date. Pure, so it can be tested for any date. */
export function buildDevReservations(base = SEED_BASE_DATE) {
  return PLAN.map(([apartment_name, from, to, channel, guest_name, guest_phone]) => {
    const check_in_date = addDays(base, from);
    const check_out_date = addDays(base, to);
    const nights = nightsBetween(check_in_date, check_out_date);
    return {
      apartment_name,
      channel,
      check_in_date,
      check_out_date,
      guest_name,
      guest_phone,
      total_amount_eur: (nights * NIGHTLY_RATE_EUR[apartment_name]).toFixed(2),
    };
  });
}
