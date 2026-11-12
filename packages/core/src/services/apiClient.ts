import { isValidISODate, isValidYearMonth } from '../models/date';
import type {
  Apartment,
  ApartmentDetails,
  AuthSession,
  ISODate,
  LoginResult,
  NewUserRequest,
  Reservation,
  RoleOption,
  RolePermissions,
  RoleUpdateRequest,
  RoleWithPermissions,
  UserSummary,
  UserUpdateRequest,
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
    /** Messages per form field when the server rejected a form (400, 403, 409), e.g. { email: "..." }. */
    readonly fields?: Record<string, string>,
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
  /** One user (the details screen); rejects with an ApiError, 404 when there is none. */
  getUser(id: string): Promise<UserSummary>;
  /** The active roles, for the role dropdown of the user forms. */
  getRoles(): Promise<RoleOption[]>;
  /** Every permission name and the roles with the permissions they have (the Manage roles screen). */
  getRolePermissions(): Promise<RolePermissions>;
  /** Sets the permissions of a role. ApiError 403 for the admin role or for an admin-only permission. */
  updateRole(update: RoleUpdateRequest): Promise<RoleWithPermissions>;
  /** Adds a user. Rejects with an ApiError whose `fields` say what is wrong (400) or that the email is taken (409). */
  createUser(user: NewUserRequest): Promise<UserSummary>;
  /** Changes a user (only the fields sent). ApiError 403 for the admin's own deactivation or role. */
  updateUser(update: UserUpdateRequest): Promise<UserSummary>;
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

/** One user from the server (details, create, edit), or an ApiError when the answer is not one. */
export function mapUserResponse(dto: unknown): UserSummary {
  const [user] = mapUsersResponse([dto]);
  if (!user) throw new ApiError('The server sent an unexpected answer.', 0);
  return user;
}

/** The roles, skipping any item that is not { id, name } with text values. */
export function mapRolesResponse(dto: unknown): RoleOption[] {
  if (!Array.isArray(dto)) return [];
  const out: RoleOption[] = [];
  for (const r of dto as Record<string, unknown>[]) {
    if (r !== null && typeof r === 'object' && isString(r.id) && isString(r.name)) out.push({ id: r.id, name: r.name });
  }
  return out;
}

/** One role with its permissions, or an ApiError when the answer is not one. */
export function mapRoleResponse(dto: unknown): RoleWithPermissions {
  const r = dto as Record<string, unknown> | null;
  if (r && typeof r === 'object' && isString(r.id) && isString(r.name) && isBoolean(r.isProtected) && Array.isArray(r.permissions)) {
    return { id: r.id, name: r.name, isProtected: r.isProtected, permissions: (r.permissions as unknown[]).filter(isString) };
  }
  throw new ApiError('The server sent an unexpected answer.', 0);
}

/** The Manage roles data. Roles that are not well formed are skipped; an answer that is not this shape is an ApiError. */
export function mapRolePermissionsResponse(dto: unknown): RolePermissions {
  const d = dto as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.permissions) || !Array.isArray(d.roles)) {
    throw new ApiError('The server sent an unexpected answer.', 0);
  }
  const roles: RoleWithPermissions[] = [];
  for (const role of d.roles) {
    try {
      roles.push(mapRoleResponse(role));
    } catch {
      /* skip a role that is not well formed */
    }
  }
  return { permissions: (d.permissions as unknown[]).filter(isString), roles };
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

async function readError(
  res: { status: number; json(): Promise<unknown> },
  fallback: string,
): Promise<{ message: string; fields?: Record<string, string> }> {
  try {
    const body = (await res.json()) as { error?: unknown; fields?: unknown };
    const message = typeof body?.error === 'string' ? body.error : fallback;
    const fields: Record<string, string> = {};
    if (body?.fields && typeof body.fields === 'object') {
      for (const [name, text] of Object.entries(body.fields as Record<string, unknown>)) if (typeof text === 'string') fields[name] = text;
    }
    return Object.keys(fields).length ? { message, fields } : { message };
  } catch {
    /* non-JSON body */
  }
  return { message: fallback };
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
      const { message, fields } = await readError(res, fallbackError);
      throw new ApiError(message, res.status, fields);
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
    async getUser(id) {
      return mapUserResponse(await request('GET', `/api/users?id=${encodeURIComponent(id)}`, 'Could not load the user.'));
    },
    async getRoles() {
      return mapRolesResponse(await request('GET', '/api/roles', 'Could not load roles.'));
    },
    async getRolePermissions() {
      return mapRolePermissionsResponse(await request('GET', '/api/roles/permissions', 'Could not load roles.'));
    },
    async updateRole(update) {
      return mapRoleResponse(await request('POST', '/api/roles/edit', 'Could not update the role.', update));
    },
    async createUser(user) {
      return mapUserResponse(await request('POST', '/api/users/create', 'Could not create the user.', user));
    },
    async updateUser(update) {
      return mapUserResponse(await request('POST', '/api/users/edit', 'Could not update the user.', update));
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
