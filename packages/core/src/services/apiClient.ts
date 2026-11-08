import { isValidISODate, isValidYearMonth } from '../models/date';
import type { Apartment, ApartmentDetails, ISODate, Reservation, UserSummary, YearMonth } from '../models/types';

/** Minimal fetch signature, so core doesn't depend on DOM or Node typings. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ApiClientOptions {
  /** e.g. "https://airtable-reservation-form.vercel.app", or "" for same-origin. No trailing slash needed. */
  baseUrl: string;
  fetch?: FetchLike;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CalendarData {
  month: YearMonth;
  apartments: Apartment[];
  reservations: Reservation[];
}

export interface ApiClient {
  getCalendar(month: YearMonth): Promise<CalendarData>;
  /** All active apartments with their details, ordered by name. */
  getApartments(): Promise<ApartmentDetails[]>;
  /** The users with their role (never a password). */
  getUsers(): Promise<UserSummary[]>;
}

// ---- Wire format of GET /api/calendar ----

interface CalendarResponseDto {
  month?: unknown;
  apartments?: { id?: unknown; name?: unknown }[];
  reservations?: { guest?: unknown; apartments?: unknown; checkIn?: unknown; checkOut?: unknown }[];
}

export function mapCalendarResponse(dto: CalendarResponseDto, requested: YearMonth): CalendarData {
  const apartments: Apartment[] = (dto.apartments ?? [])
    .filter((a): a is { id: string; name: string } => typeof a.id === 'string' && typeof a.name === 'string')
    .map((a) => ({ id: a.id, name: a.name }));

  const reservations: Reservation[] = [];
  (dto.reservations ?? []).forEach((r, index) => {
    if (!isValidISODate(r.checkIn) || !isValidISODate(r.checkOut)) return;
    const checkIn: ISODate = r.checkIn;
    const checkOut: ISODate = r.checkOut;
    const apartmentIds = Array.isArray(r.apartments) ? r.apartments.filter((x): x is string => typeof x === 'string') : [];
    for (const apartmentId of apartmentIds) {
      reservations.push({
        // The endpoint doesn't return record ids yet; this key is stable within one response.
        id: `${apartmentId}:${checkIn}:${checkOut}:${index}`,
        apartmentId,
        guest: typeof r.guest === 'string' ? r.guest : '',
        checkIn,
        checkOut,
        // The endpoint already excludes cancelled bookings.
        status: 'active',
      });
    }
  });

  return {
    month: isValidYearMonth(dto.month) ? dto.month : requested,
    apartments,
    reservations,
  };
}

// ---- Wire format of GET /api/apartments ----

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** Maps the response, skipping any item that is missing a field or has one of the wrong type. */
export function mapApartmentsResponse(dto: unknown): ApartmentDetails[] {
  if (!Array.isArray(dto)) return [];
  const out: ApartmentDetails[] = [];
  for (const a of dto as Record<string, unknown>[]) {
    if (
      a !== null && typeof a === 'object' &&
      isString(a.id) && isString(a.name) && isString(a.address) && isString(a.apartmentNumber) &&
      isNumber(a.floor) && isString(a.buildingName) && isNumber(a.areaM2) && isBoolean(a.hasBathtub) &&
      isBoolean(a.hasTerrace) && isBoolean(a.hasDishwasher) &&
      // Owner contact and rent are optional (left out by the server without the permission), but when present
      // they must have the right type.
      (a.ownerName === undefined || isString(a.ownerName)) &&
      (a.ownerPhone === undefined || isString(a.ownerPhone)) &&
      (a.monthlyRentEur === undefined || isNumber(a.monthlyRentEur))
    ) {
      out.push({
        id: a.id,
        name: a.name,
        address: a.address,
        apartmentNumber: a.apartmentNumber,
        floor: a.floor,
        buildingName: a.buildingName,
        areaM2: a.areaM2,
        ...(isString(a.ownerName) ? { ownerName: a.ownerName } : {}),
        ...(isString(a.ownerPhone) ? { ownerPhone: a.ownerPhone } : {}),
        ...(isNumber(a.monthlyRentEur) ? { monthlyRentEur: a.monthlyRentEur } : {}),
        hasBathtub: a.hasBathtub,
        hasTerrace: a.hasTerrace,
        hasDishwasher: a.hasDishwasher,
        parkingSpot: isString(a.parkingSpot) && a.parkingSpot !== '' ? a.parkingSpot : null,
      });
    }
  }
  return out;
}

// ---- Wire format of GET /api/users ----

/**
 * Maps the response, skipping any item with a missing field or a wrong type. Fields are copied one by one,
 * so anything else in the response (such as a password hash, which the server never sends) is dropped.
 */
export function mapUsersResponse(dto: unknown): UserSummary[] {
  if (!Array.isArray(dto)) return [];
  const out: UserSummary[] = [];
  for (const u of dto as Record<string, unknown>[]) {
    if (
      u !== null && typeof u === 'object' &&
      isString(u.id) && isString(u.email) && isString(u.firstName) && isString(u.lastName) &&
      isString(u.role) && isBoolean(u.isActive)
    ) {
      out.push({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: isString(u.phone) && u.phone !== '' ? u.phone : null,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: isString(u.lastLoginAt) ? u.lastLoginAt : null,
      });
    }
  }
  return out;
}

async function readError(res: { status: number; json(): Promise<unknown> }, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === 'string') return body.error;
  } catch {
    /* non-JSON body */
  }
  return fallback;
}

export function createApiClient({ baseUrl, fetch: fetchImpl }: ApiClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = fetchImpl ?? ((url, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(url, init));

  /** GET a JSON endpoint. Network failures and error responses become an ApiError with a readable message. */
  async function getJson(path: string, fallbackError: string): Promise<unknown> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${base}${path}`, { headers: { Accept: 'application/json' } });
    } catch {
      throw new ApiError('No connection. Check your internet and try again.', 0);
    }
    if (!res.ok) throw new ApiError(await readError(res, fallbackError), res.status);
    return res.json();
  }

  return {
    async getCalendar(month) {
      const dto = await getJson(`/api/calendar?month=${encodeURIComponent(month)}`, 'Could not load calendar.');
      return mapCalendarResponse(dto as CalendarResponseDto, month);
    },
    async getApartments() {
      return mapApartmentsResponse(await getJson('/api/apartments', 'Could not load apartments.'));
    },
    async getUsers() {
      return mapUsersResponse(await getJson('/api/users', 'Could not load users.'));
    },
  };
}
