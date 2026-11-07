// Postgres schema (Drizzle). Source of truth for the database structure.
// Change it with: edit this file -> `npm run db:generate` -> review the SQL -> `npm run db:migrate`.
// See docs/database-migrations.md. Server side only: the mobile app never connects to the database.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

export const reservationStatus = pgEnum('reservation_status', ['active', 'cancelled', 'no_show']);

// No default on the column: the user must choose the channel.
export const reservationChannel = pgEnum('reservation_channel', ['direct', 'booking', 'airbnb', 'local_agency']);

// ---------------------------------------------------------------------------------------------
// Columns shared by every table
// ---------------------------------------------------------------------------------------------

const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

// Deactivate instead of delete (ADR 0003). `delta_app` has no DELETE privilege.
const isActive = () => boolean('is_active').notNull().default(true);

// `updated_at` is kept current by the `set_updated_at` trigger (migration `updated_at_triggers`).
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// User's name for now; later a foreign key to a users table.
const audit = () => ({
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

// Optional "+", then 6 to 15 digits. Written with [+] to avoid backslash escaping in the SQL template.
// Inlined with sql.raw as a constant literal: a normal `${...}` would become a bind parameter ($1),
// which is not valid inside a CHECK constraint in DDL.
const PHONE_REGEX = sql.raw(`'^[+]?[0-9]{6,15}$'`);

// ---------------------------------------------------------------------------------------------
// apartments
// ---------------------------------------------------------------------------------------------

export const apartments = pgTable(
  'apartments',
  {
    id: id(),
    name: text('name').notNull().unique(),
    address: text('address').notNull(),
    apartmentNumber: text('apartment_number').notNull(), // e.g. "12A"
    floor: integer('floor').notNull(), // 0 = ground floor
    buildingName: text('building_name').notNull(), // e.g. Suncokret, Mimoza, Lala
    areaM2: integer('area_m2').notNull(),
    ownerName: text('owner_name').notNull(),
    ownerPhone: text('owner_phone').notNull(),
    monthlyRentEur: integer('monthly_rent_eur').notNull(),
    hasBathtub: boolean('has_bathtub').notNull().default(false),
    hasTerrace: boolean('has_terrace').notNull().default(false),
    hasDishwasher: boolean('has_dishwasher').notNull().default(false),
    parkingSpot: text('parking_spot'), // optional
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [
    check('apartments_area_m2_positive', sql`${t.areaM2} > 0`),
    check('apartments_owner_phone_format', sql`${t.ownerPhone} ~ ${PHONE_REGEX}`),
    check('apartments_monthly_rent_eur_non_negative', sql`${t.monthlyRentEur} >= 0`),
  ],
);

// ---------------------------------------------------------------------------------------------
// reservations
// ---------------------------------------------------------------------------------------------

export const reservations = pgTable(
  'reservations',
  {
    id: id(),
    apartmentId: bigint('apartment_id', { mode: 'number' })
      .notNull()
      .references(() => apartments.id, { onDelete: 'restrict' }),
    status: reservationStatus('status').notNull().default('active'),
    channel: reservationChannel('channel').notNull(),
    // Date-only values (YYYY-MM-DD strings), never shifted through UTC.
    // Check-in 14:00 and check-out 11:00 are app rules and are not stored.
    checkInDate: date('check_in_date', { mode: 'string' }).notNull(),
    checkOutDate: date('check_out_date', { mode: 'string' }).notNull(),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone').notNull(),
    note: text('note'), // optional
    // SOURCE OF TRUTH, entered by the user. Money in EUR.
    totalAmountEur: numeric('total_amount_eur', { precision: 10, scale: 2 }).notNull(),
    // Derived, never written by the app. The form links nightly price and total, but only
    // total_amount_eur is sent to the API.
    pricePerNightEur: numeric('price_per_night_eur', { precision: 10, scale: 2 })
      .notNull()
      .generatedAlwaysAs(
        (): ReturnType<typeof sql> =>
          sql`round(${reservations.totalAmountEur} / (${reservations.checkOutDate} - ${reservations.checkInDate}), 2)`,
      ),
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [
    check('reservations_check_out_after_check_in', sql`${t.checkOutDate} > ${t.checkInDate}`),
    check('reservations_guest_phone_format', sql`${t.guestPhone} ~ ${PHONE_REGEX}`),
    check('reservations_total_amount_eur_non_negative', sql`${t.totalAmountEur} >= 0`),
    // Foreign keys are not indexed automatically; calendar queries filter by apartment and dates.
    index('reservations_apartment_dates_idx').on(t.apartmentId, t.checkInDate, t.checkOutDate),
  ],
);

export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
