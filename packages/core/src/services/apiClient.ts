import { isValidISODate, isValidYearMonth } from '../models/date';
import type {
  Apartment,
  ApartmentDetails,
  AuthSession,
  ISODate,
  LoginResult,
  Reservation,
  UserSummary,
  YearMonth,
} from '../models/types';

/** Minimal fetch signature, so core doesn't depend on DOM or Node typings. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ApiClientOptions {
  /** e.g. "https://airtable-reservation-form.vercel.app", or "" for same-origin. No trailing slash needed. */
  baseUrl: string;
  fetch?: FetchLike;
  /** The session token, sent as `Authorization: Bearer <token>` on every call except login. */
  getToken?: () => string | null | undefined;
  /**
   * Called when a call that sent a token gets 401 (the session ended, expired or the user was deactivated):
   * the app clears its session and goes back to the login screen. NOT called for a failed login.
   */
  onUnauthorized?: () => void;
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
  /** Signs in. Rejects with an ApiError: 401 "Invalid email or password", 429 too many attempts. */
  login(email: string, password: string): Promise<LoginResult>;
  /** The signed-in user and the CURRENT permissions (also refreshes the session expiry). */
  getMe(): Promise<AuthSession>;
  /** Ends this session on the server. */
  logout(): Promise<void>;
  /** Ends every session of the signed-in user on the server, this device included. */
  logoutAll(): Promise<void>;
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

// ---- Wire format of POST /api/auth/login and GET /api/auth/me ----

/** Maps a session response, or throws an ApiError when it is not one (a misbehaving server must never look signed in). */
export function mapSessionResponse(dto: unknown): AuthSession {
  const d = dto as Record<string, unknown> | null;
  const u = (d && typeof d === 'object' ? d.user : null) as Record<string, unknown> | null;
  if (
    u && typeof u === 'object' &&
    isString(u.id) && isString(u.email) && isString(u.firstName) && isString(u.lastName) && isString(u.role) &&
    Array.isArray(d!.permissions) && isString(d!.expiresAt)
  ) {
    return {
      user: { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role },
      permissions: (d!.permissions as unknown[]).filter(isString),
      expiresAt: d!.expiresAt,
    };
  }
  throw new ApiError('The server sent an unexpected answer.', 0);
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

export function createApiClient({ baseUrl, fetch: fetchImpl, getToken, onUnauthorized }: ApiClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = fetchImpl ?? ((url, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(url, init));

  /**
   * Calls a JSON endpoint. Adds the token when there is one. Network failures and error responses become an
   * ApiError with a readable message; a 401 on a call that sent a token also tells the app (onUnauthorized).
   */
  async function request(
    method: 'GET' | 'POST',
    path: string,
    fallbackError: string,
    body?: unknown,
    { withToken = true }: { withToken?: boolean } = {},
  ): Promise<unknown> {
    const token = withToken ? getToken?.() : undefined; // login never sends a token
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      throw new ApiError('No connection. Check your internet and try again.', 0);
    }
    if (!res.ok) {
      if (res.status === 401 && token) onUnauthorized?.();
      throw new ApiError(await readError(res, fallbackError), res.status);
    }
    return res.json();
  }

  return {
    async getCalendar(month) {
      const dto = await request('GET', `/api/calendar?month=${encodeURIComponent(month)}`, 'Could not load calendar.');
      return mapCalendarResponse(dto as CalendarResponseDto, month);
    },
    async getApartments() {
      return mapApartmentsResponse(await request('GET', '/api/apartments', 'Could not load apartments.'));
    },
    async getUsers() {
      return mapUsersResponse(await request('GET', '/api/users', 'Could not load users.'));
    },
    async login(email, password) {
      const dto = (await request('POST', '/api/auth/login', 'Could not sign in.', { email, password }, { withToken: false })) as { token?: unknown };
      if (!isString(dto?.token) || dto.token === '') throw new ApiError('The server sent an unexpected answer.', 0);
      return { token: dto.token, ...mapSessionResponse(dto) };
    },
    async getMe() {
      return mapSessionResponse(await request('GET', '/api/auth/me', 'Could not check the session.'));
    },
    async logout() {
      await request('POST', '/api/auth/logout', 'Could not sign out.');
    },
    async logoutAll() {
      await request('POST', '/api/auth/logout-all', 'Could not sign out of all devices.');
    },
  };
}
