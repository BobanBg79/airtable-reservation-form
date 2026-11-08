/** Date-only value in `YYYY-MM-DD` format (Europe/Belgrade calendar day). Never a timestamp. */
export type ISODate = string & { readonly __brand: 'ISODate' };

/** Calendar month in `YYYY-MM` format. */
export type YearMonth = string & { readonly __brand: 'YearMonth' };

export type ReservationStatus = 'active' | 'cancelled';

export interface Apartment {
  id: string;
  name: string;
  note?: string;
}

/** Everything the apartment list and the detail screen show (read-only for now). */
export interface ApartmentDetails extends Apartment {
  address: string;
  /** e.g. "12A" */
  apartmentNumber: string;
  /** 0 = ground floor */
  floor: number;
  /** e.g. "Mimoza" */
  buildingName: string;
  areaM2: number;
  /**
   * Owner contact: only present with the permission can_view_apartment_owner_contact (the server leaves it
   * out for other roles), so screens must handle its absence.
   */
  ownerName?: string;
  ownerPhone?: string;
  /** EUR. Only present with the permission can_view_apartment_rent. */
  monthlyRentEur?: number;
  hasBathtub: boolean;
  hasTerrace: boolean;
  hasDishwasher: boolean;
  /** Optional, e.g. "P12". */
  parkingSpot: string | null;
}

/**
 * A user as the Users screen shows it. There is deliberately no password (hash) field: the API never
 * sends one and the client never reads one (ADR 0007).
 */
export interface UserSummary {
  id: string;
  /** The login; stored lowercase. */
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** Role name, e.g. "business_owner". */
  role: string;
  isActive: boolean;
  /** ISO timestamp of the last login, or null if the user never signed in. */
  lastLoginAt: string | null;
}

/** The signed-in user, as the server describes them after login and from /api/auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Role name, e.g. "manager". Screens decide with `permissions`, never with the role name. */
  role: string;
}

/** A signed-in session: who, what they may do, and when the session expires (it slides while in use). */
export interface AuthSession {
  user: AuthUser;
  /** Permission names, e.g. "can_view_reservation". */
  permissions: string[];
  /** ISO timestamp. */
  expiresAt: string;
}

/** What POST /api/auth/login returns: the session plus the token to send as `Authorization: Bearer`. */
export interface LoginResult extends AuthSession {
  token: string;
}

export interface Reservation {
  id: string;
  apartmentId: string;
  guest: string;
  checkIn: ISODate;
  checkOut: ISODate;
  status: ReservationStatus;
  phone?: string;
  /** EUR */
  amount?: number;
  note?: string;
}
