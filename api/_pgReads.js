// Read queries against PostgreSQL. Pure: the SQL client is passed in, so tests can use a fake one.
// Responses have the shape packages/core parses (mapCalendarResponse): ids are strings and dates
// are YYYY-MM-DD strings.
import { PG_FREES_DATES } from './_status.js';

/** Active apartments, ordered by name. */
export async function loadApartments(sql) {
  const rows = await sql.query('select id::text as id, name from apartments where is_active order by name');
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Which restricted apartment fields a caller may see, from the permission names of the session. */
export function apartmentFieldAccess(permissions) {
  const has = (name) => Array.isArray(permissions) && permissions.includes(name);
  return { ownerContact: has('can_view_apartment_owner_contact'), rent: has('can_view_apartment_rent') };
}

/**
 * Active apartments with their details, ordered by name (the apartments list and the detail screen).
 * Field names are camelCase and ids are strings, which is what packages/core parses.
 *
 * FIELD FILTERING (ADR 0008): the owner's name and phone are read and returned only with
 * `ownerContact: true` (can_view_apartment_owner_contact), the rent only with `rent: true`
 * (can_view_apartment_rent). Without them the columns are not selected and the keys are absent from the
 * response, not null. The default is nothing restricted.
 */
export async function loadApartmentDetails(sql, { ownerContact = false, rent = false } = {}) {
  const columns = [
    'id::text as id', 'name', 'address', 'apartment_number', 'floor', 'building_name', 'area_m2',
    ...(ownerContact ? ['owner_name', 'owner_phone'] : []),
    ...(rent ? ['monthly_rent_eur'] : []),
    'has_bathtub', 'has_terrace', 'has_dishwasher', 'parking_spot',
  ];
  const rows = await sql.query(`select ${columns.join(', ')} from apartments where is_active order by name`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    apartmentNumber: r.apartment_number,
    floor: r.floor,
    buildingName: r.building_name,
    areaM2: r.area_m2,
    ...(ownerContact ? { ownerName: r.owner_name, ownerPhone: r.owner_phone } : {}),
    ...(rent ? { monthlyRentEur: r.monthly_rent_eur } : {}),
    hasBathtub: r.has_bathtub,
    hasTerrace: r.has_terrace,
    hasDishwasher: r.has_dishwasher,
    parkingSpot: r.parking_spot ?? null,
  }));
}

/**
 * Users with their role name, ordered by name (the Users screen). Active and inactive ones: a deactivated
 * user stays in the list, marked inactive. System users (emails ending in `@system.local`, such as the
 * `dev-seed` owner of the seed rows) are not people and are left out.
 *
 * NEVER returns the password hash. The columns are listed by name (no `select *`), and each row is mapped
 * field by field, so a column added to `users` later cannot leak by accident (ADR 0007).
 * The route needs `can_view_user` (api/users.js).
 */
export async function loadUsers(sql) {
  const rows = await sql.query(
    `select u.id::text as id, u.email, u.first_name, u.last_name, u.phone, r.name as role,
            u.is_active, u.last_login_at
       from users u
       join roles r on r.id = u.role_id
      where u.email not like '%@system.local'
      order by lower(u.first_name), lower(u.last_name), u.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone ?? null,
    role: r.role,
    isActive: r.is_active,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
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
