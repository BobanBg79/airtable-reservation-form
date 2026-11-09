// Postgres schema (Drizzle). Source of truth for the database structure.
// Change it with: edit this file -> `npm run db:generate` -> review the SQL -> `npm run db:migrate`.
// See docs/database-migrations.md. Server side only: the mobile app never connects to the database.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
  unique,
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

// Who created and last changed the row: a foreign key to `users` (ADR 0007). Seed rows belong to the
// `dev-seed` system user. Lazy reference, because `users` is defined further down and points at itself.
const audit = () => ({
  createdBy: bigint('created_by', { mode: 'number' })
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
  updatedBy: bigint('updated_by', { mode: 'number' })
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: 'restrict' }),
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

// ---------------------------------------------------------------------------------------------
// Access model (ADR 0007): users, roles, permissions, role_permissions
// ---------------------------------------------------------------------------------------------
// The permission list lives in packages/core (`PERMISSIONS`); the reference-data migration inserts
// exactly those names and a test compares the two. Nothing in these tables is ever deleted: triggers
// refuse DELETE and TRUNCATE for every role.

// Not a SQL bind parameter, see PHONE_REGEX. Deliberately simple: no spaces, one "@", a dot in the domain.
const EMAIL_REGEX = sql.raw(`'^[^@ ]+@[^@ ]+[.][^@ ]+$'`);

export const roles = pgTable(
  'roles',
  {
    id: id(),
    name: text('name').notNull().unique(), // admin, business_owner, manager, cleaning_lady, handyman
    description: text('description'),
    // The admin role is protected: it cannot be renamed, deactivated or unprotected, and its
    // role_permissions rows cannot be deactivated (triggers).
    isProtected: boolean('is_protected').notNull().default(false),
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [check('roles_name_format', sql`${t.name} ~ ${sql.raw(`'^[a-z][a-z_]*$'`)}`)],
);

export const permissions = pgTable(
  'permissions',
  {
    id: id(),
    // can_<action>_<entity> or can_<action>_<entity>_<sub_entity>; action is view, create or edit.
    name: text('name').notNull().unique(),
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [
    check('permissions_name_format', sql`${t.name} ~ ${sql.raw(`'^can_(view|create|edit)_[a-z]+(_[a-z]+)*$'`)}`),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: id(),
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    permissionId: bigint('permission_id', { mode: 'number' })
      .notNull()
      .references(() => permissions.id, { onDelete: 'restrict' }),
    // Removing a permission from a role sets this to false (never a delete).
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [unique('role_permissions_role_permission_unique').on(t.roleId, t.permissionId)],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull().unique(), // the username, stored lowercase
    // Slow salted hash (argon2 or bcrypt). Never returned to any client, admin included.
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'), // optional
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_email_format', sql`${t.email} ~ ${EMAIL_REGEX}`),
    check('users_phone_format', sql`${t.phone} ~ ${PHONE_REGEX}`),
    index('users_role_idx').on(t.roleId),
  ],
);

// ---------------------------------------------------------------------------------------------
// Authentication (ADR 0008, docs/briefs/authentication.md): sessions and login attempts
// ---------------------------------------------------------------------------------------------

// A login session. Only the SHA-256 hash of the token is stored; the token itself never is. The expiry
// slides (now + 7 days on each authenticated request) but never passes `max_expires_at` (login + 90 days).
// Logout or revocation sets `is_active = false`; rows are never deleted. `created_by` is the session's own
// user, `updated_by` is the admin when the admin revokes it.
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxExpiresAt: timestamp('max_expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    isActive: isActive(),
    ...timestamps(),
    ...audit(),
  },
  (t) => [
    check('sessions_expiry_within_cap', sql`${t.expiresAt} <= ${t.maxExpiresAt}`),
    index('sessions_user_idx').on(t.userId),
  ],
);

// Every login attempt, for rate limiting. Insert only (delta_app has no UPDATE on this table). An exception to
// the ADR 0004 conventions: no is_active, updated_at, created_by or updated_by, because a row is never changed
// and a failed attempt has no user.
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: id(),
    email: text('email').notNull(), // lowercase, as typed
    ip: text('ip').notNull(),
    userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }), // null: unknown email
    succeeded: boolean('succeeded').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_email_ip_created_idx').on(t.email, t.ip, t.createdAt),
    index('login_attempts_ip_created_idx').on(t.ip, t.createdAt),
  ],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
