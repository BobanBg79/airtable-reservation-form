// Fake data for the Neon DEV branch only. Only the apartment names are meaningful: they match real
// apartment names shown by the calendar screen (apps/mobile MonthGrid reads `name`; colours derive
// from it). Everything else is made up. Never put real owner phone numbers, addresses or guests here.
import { addDays, nightsBetween } from '../packages/core/src/models/date.ts';

export const SEED_MARKER = 'dev-seed'; // value of created_by / updated_by on every seeded row

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
];

// Price per night (EUR) used to make up a total for each apartment.
const NIGHTLY_RATE_EUR = { Atlas: 55, Berlin: 70, Devetka: 60 };

// Ten reservations laid out relative to `today` (YYYY-MM-DD, Europe/Belgrade), so the calendar
// always has stays running now and in the coming weeks. Offsets are in days from today.
// The set is deliberately varied: a stay in progress, same-day changeovers (a check-out on the day
// another guest checks in), short and long stays, and one that crosses into the next month.
// No two reservations of the same apartment overlap (the database does not enforce that yet).
const PLAN = [
  // [apartment, check-in offset, check-out offset, channel, guest, phone]
  ['Atlas', -2, 2, 'direct', 'Marko Jovanović', '+38160000101'], // in progress
  ['Atlas', 2, 6, 'booking', 'Ivana Petrović', '+38160000102'], // same-day changeover with the stay above
  ['Atlas', 9, 16, 'airbnb', 'Stefan Nikolić', '+38160000103'],
  ['Atlas', 20, 23, 'local_agency', 'Milica Đorđević', '+38160000104'],
  ['Berlin', -1, 3, 'booking', 'Luka Stanković', '+38160000105'], // in progress
  ['Berlin', 5, 8, 'direct', 'Jelena Ilić', '+38160000106'],
  ['Berlin', 10, 24, 'airbnb', 'Anna Becker', '+38160000107'], // two weeks, can cross a month end
  ['Devetka', 1, 4, 'direct', 'Nikola Pavlović', '+38160000108'],
  ['Devetka', 4, 7, 'local_agency', 'Teodora Marković', '+38160000109'], // same-day changeover
  ['Devetka', 12, 15, 'booking', 'Peter Novak', '+38160000110'],
];

/** The ten dev reservations for a given `today`. Pure, so it can be tested for any date. */
export function buildDevReservations(today) {
  return PLAN.map(([apartment_name, from, to, channel, guest_name, guest_phone]) => {
    const check_in_date = addDays(today, from);
    const check_out_date = addDays(today, to);
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
