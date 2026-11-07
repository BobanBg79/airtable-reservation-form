// Fake data for the Neon DEV branch only. Only the names are meaningful: they match real apartment
// names shown by the calendar screen (apps/mobile MonthGrid reads `name`; colours derive from it).
// Everything else is made up. Never put real owner phone numbers or addresses in this file.

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
