// Read queries against PostgreSQL. Pure: the SQL client is passed in, so tests can use a fake one.
// Responses have the shape packages/core parses (mapCalendarResponse): ids are strings and dates
// are YYYY-MM-DD strings.
import { PG_FREES_DATES } from './_status.js';

/** Active apartments, ordered by name. */
export async function loadApartments(sql) {
  const rows = await sql.query('select id::text as id, name from apartments where is_active order by name');
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Active apartments with every detail, ordered by name (the apartments list and the detail screen).
 * Field names are camelCase and ids are strings, which is what packages/core parses.
 * NOTE: includes the owner's name and phone and the rent; the API has no auth yet (KNOWN_ISSUES 17).
 */
export async function loadApartmentDetails(sql) {
  const rows = await sql.query(
    `select id::text as id, name, address, apartment_number, floor, building_name, area_m2,
            owner_name, owner_phone, monthly_rent_eur, has_bathtub, has_terrace, has_dishwasher, parking_spot
       from apartments
      where is_active
      order by name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    apartmentNumber: r.apartment_number,
    floor: r.floor,
    buildingName: r.building_name,
    areaM2: r.area_m2,
    ownerName: r.owner_name,
    ownerPhone: r.owner_phone,
    monthlyRentEur: r.monthly_rent_eur,
    hasBathtub: r.has_bathtub,
    hasTerrace: r.has_terrace,
    hasDishwasher: r.has_dishwasher,
    parkingSpot: r.parking_spot ?? null,
  }));
}

/**
 * Apartments plus the reservations that block dates within [start, end), both YYYY-MM-DD.
 * A reservation belongs to the month when checkIn < end and checkOut > start (same rule as everywhere).
 * Dates are selected as text on purpose: the driver would turn a `date` into a JS Date and shift it.
 */
export async function loadCalendar(sql, { start, end }) {
  const [apartments, rows] = await Promise.all([
    loadApartments(sql),
    sql.query(
      `select r.guest_name,
              r.apartment_id::text as apartment_id,
              r.check_in_date::text as check_in,
              r.check_out_date::text as check_out
         from reservations r
         join apartments a on a.id = r.apartment_id
        where a.is_active
          and r.is_active
          and r.status::text <> all($1::text[])
          and r.check_in_date < $2::date
          and r.check_out_date > $3::date
        order by r.check_in_date, r.id`,
      [PG_FREES_DATES, end, start],
    ),
  ]);

  return {
    apartments,
    reservations: rows.map((r) => ({
      guest: r.guest_name ?? '',
      apartments: [r.apartment_id],
      checkIn: r.check_in,
      checkOut: r.check_out,
    })),
  };
}
