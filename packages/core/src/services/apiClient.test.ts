import { describe, expect, it, vi } from 'vitest';
import { toYearMonth } from '../models/date';
import { ApiError, createApiClient, mapApartmentsResponse, mapSessionResponse, mapUsersResponse, type FetchLike } from './apiClient';

const NOV = toYearMonth('2026-11');

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('createApiClient.getCalendar', () => {
  it('calls the endpoint and maps the response', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        month: '2026-11',
        apartments: [
          { id: 'rec1', name: 'Atlas' },
          { id: 'rec2', name: 'Luna' },
        ],
        reservations: [
          { guest: 'Marko', apartments: ['rec1'], checkIn: '2026-11-03', checkOut: '2026-11-06' },
          { guest: 'Group', apartments: ['rec1', 'rec2'], checkIn: '2026-11-10', checkOut: '2026-11-12' },
        ],
      }),
    );
    const api = createApiClient({ baseUrl: 'https://example.com/', fetch });

    const data = await api.getCalendar(NOV);

    expect(fetch).toHaveBeenCalledWith('https://example.com/api/calendar?month=2026-11', expect.anything());
    expect(data.month).toBe('2026-11');
    expect(data.apartments).toEqual([
      { id: 'rec1', name: 'Atlas' },
      { id: 'rec2', name: 'Luna' },
    ]);
    expect(data.reservations).toHaveLength(3); // multi-apartment booking is split per apartment
    expect(data.reservations[0]).toMatchObject({ apartmentId: 'rec1', guest: 'Marko', checkIn: '2026-11-03', status: 'active' });
    expect(new Set(data.reservations.map((r) => r.id)).size).toBe(3);
  });

  it('supports same-origin base url', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, { apartments: [], reservations: [] }));
    await createApiClient({ baseUrl: '', fetch }).getCalendar(NOV);
    expect(fetch.mock.calls[0]![0]).toBe('/api/calendar?month=2026-11');
  });

  it('skips reservations with missing or invalid dates', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        apartments: [],
        reservations: [
          { guest: 'No dates', apartments: ['rec1'] },
          { guest: 'Bad', apartments: ['rec1'], checkIn: '2026-02-30', checkOut: '2026-03-02' },
        ],
      }),
    );
    const data = await createApiClient({ baseUrl: '', fetch }).getCalendar(NOV);
    expect(data.reservations).toEqual([]);
    expect(data.month).toBe('2026-11'); // falls back to requested month
  });

  it('throws ApiError with the server message', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(500, { error: 'Could not load calendar.' }));
    await expect(createApiClient({ baseUrl: '', fetch }).getCalendar(NOV)).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Could not load calendar.',
    });
  });

  it('throws a connection ApiError when fetch rejects', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await createApiClient({ baseUrl: '', fetch }).getCalendar(NOV).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });
});

const apartmentDto = {
  id: '2',
  name: 'Atlas',
  address: 'Test Street 1, Belgrade',
  apartmentNumber: '1A',
  floor: 0,
  buildingName: 'Mimoza',
  areaM2: 38,
  ownerName: 'Test Owner One',
  ownerPhone: '+38160000001',
  monthlyRentEur: 350,
  hasBathtub: false,
  hasTerrace: true,
  hasDishwasher: false,
  parkingSpot: null,
};

describe('createApiClient.getApartments', () => {
  it('calls the endpoint and maps the details', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse(200, [apartmentDto, { ...apartmentDto, id: '3', name: 'Berlin', parkingSpot: 'P12' }]),
    );
    const list = await createApiClient({ baseUrl: 'https://example.com/', fetch }).getApartments();

    expect(fetch).toHaveBeenCalledWith('https://example.com/api/apartments', expect.anything());
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(apartmentDto);
    expect(list[1]).toMatchObject({ id: '3', name: 'Berlin', parkingSpot: 'P12' });
  });

  it('throws ApiError with the server message, and a connection error when offline', async () => {
    const failing = vi.fn<FetchLike>(async () => jsonResponse(500, { error: 'Could not load apartments.' }));
    await expect(createApiClient({ baseUrl: '', fetch: failing }).getApartments()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Could not load apartments.',
    });

    const offline = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await createApiClient({ baseUrl: '', fetch: offline }).getApartments().catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
  });
});

describe('mapApartmentsResponse', () => {
  it('skips items with a missing field or a field of the wrong type', () => {
    const { address: _address, ...withoutAddress } = apartmentDto;
    const list = mapApartmentsResponse([
      apartmentDto,
      withoutAddress,
      { ...apartmentDto, id: '4', floor: '2' },
      { ...apartmentDto, id: '5', monthlyRentEur: Number.NaN },
      { ...apartmentDto, id: '6', hasTerrace: 'yes' },
      null,
      'nonsense',
    ]);
    expect(list.map((a) => a.id)).toEqual(['2']);
  });

  it('accepts apartments without owner contact and rent (the server leaves them out without the permission)', () => {
    const { ownerName: _n, ownerPhone: _p, monthlyRentEur: _r, ...restricted } = apartmentDto;
    const [a] = mapApartmentsResponse([restricted]);
    expect(a).toBeDefined();
    expect('ownerName' in a!).toBe(false);
    expect('ownerPhone' in a!).toBe(false);
    expect('monthlyRentEur' in a!).toBe(false);
    expect(a!.name).toBe(apartmentDto.name);
  });

  it('accepts rent without owner contact and the other way round', () => {
    const { ownerName: _n, ownerPhone: _p, ...rentOnly } = apartmentDto;
    expect(mapApartmentsResponse([rentOnly])[0]).toMatchObject({ monthlyRentEur: 350 });
    const { monthlyRentEur: _r, ...contactOnly } = apartmentDto;
    expect(mapApartmentsResponse([contactOnly])[0]).toMatchObject({ ownerName: 'Test Owner One', ownerPhone: '+38160000001' });
  });

  it('still rejects an owner or rent field that is present with the wrong type', () => {
    expect(mapApartmentsResponse([{ ...apartmentDto, ownerName: 5 }])).toEqual([]);
    expect(mapApartmentsResponse([{ ...apartmentDto, ownerPhone: null }])).toEqual([]);
    expect(mapApartmentsResponse([{ ...apartmentDto, monthlyRentEur: '350' }])).toEqual([]);
  });

  it('turns a missing or empty parking spot into null', () => {
    const { parkingSpot: _spot, ...noSpot } = apartmentDto;
    expect(mapApartmentsResponse([noSpot])[0]!.parkingSpot).toBeNull();
    expect(mapApartmentsResponse([{ ...apartmentDto, parkingSpot: '' }])[0]!.parkingSpot).toBeNull();
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(mapApartmentsResponse({ error: 'x' })).toEqual([]);
    expect(mapApartmentsResponse(undefined)).toEqual([]);
  });
});

describe('createApiClient.getUsers / mapUsersResponse', () => {
  const userDto = {
    id: '5', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic',
    phone: null, role: 'admin', isActive: true, lastLoginAt: null,
  };

  it('calls the endpoint and maps the users', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse(200, [userDto, { ...userDto, id: '7', phone: '+381601234567', role: 'manager', isActive: false, lastLoginAt: '2026-11-08T10:00:00.000Z' }]),
    );
    const list = await createApiClient({ baseUrl: 'https://example.com/', fetch }).getUsers();

    expect(fetch).toHaveBeenCalledWith('https://example.com/api/users', expect.anything());
    expect(list[0]).toEqual(userDto);
    expect(list[1]).toMatchObject({ id: '7', phone: '+381601234567', role: 'manager', isActive: false, lastLoginAt: '2026-11-08T10:00:00.000Z' });
  });

  it('never copies a password field, even if the response had one', () => {
    const [user] = mapUsersResponse([{ ...userDto, passwordHash: '$2b$12$x', password_hash: '$2b$12$x', password: 'x' }]);
    expect(JSON.stringify(user)).not.toMatch(/password|\$2b/i);
    expect(Object.keys(user!).sort()).toEqual(['email', 'firstName', 'id', 'isActive', 'lastLoginAt', 'lastName', 'phone', 'role']);
  });

  it('skips malformed items and a non-array response', () => {
    expect(mapUsersResponse([userDto, { ...userDto, id: 7 }, { ...userDto, isActive: 'yes' }, null])).toHaveLength(1);
    expect(mapUsersResponse({ error: 'x' })).toEqual([]);
  });

  it('throws ApiError with the server message', async () => {
    const failing = vi.fn<FetchLike>(async () => jsonResponse(500, { error: 'Could not load users.' }));
    await expect(createApiClient({ baseUrl: '', fetch: failing }).getUsers()).rejects.toMatchObject({
      name: 'ApiError', status: 500, message: 'Could not load users.',
    });
  });
});

// ---- authentication ----

const sessionDto = {
  user: { id: '5', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic', role: 'admin' },
  permissions: ['can_view_user', 'can_view_apartment'],
  expiresAt: '2026-12-08T10:00:00.000Z',
};

describe('createApiClient authentication', () => {
  it('sends the token as a Bearer header on every call, and none when there is no token', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, []));
    let token: string | null = 'abc123';
    const api = createApiClient({ baseUrl: 'https://example.com', fetch, getToken: () => token });

    await api.getUsers();
    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: 'Bearer abc123' });

    token = null;
    await api.getApartments();
    expect(fetch.mock.calls[1]![1]!.headers).not.toHaveProperty('Authorization');
  });

  it('login posts the credentials as JSON WITHOUT a token and returns the token with the session', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, { token: 'tok-1', ...sessionDto }));
    const api = createApiClient({ baseUrl: 'https://example.com', fetch, getToken: () => 'stale-token' });
    // Even if a stale token is lying around, login never sends it.
    const result = await api.login('owner@example.com', 'secret-pass-123');

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://example.com/api/auth/login');
    expect(init!.method).toBe('POST');
    expect(init!.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init!.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init!.body!)).toEqual({ email: 'owner@example.com', password: 'secret-pass-123' });
    expect(result).toEqual({ token: 'tok-1', ...sessionDto });
  });

  it('a failed login rejects with the server message and does NOT sign the app out (no token was sent)', async () => {
    const onUnauthorized = vi.fn();
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(401, { error: 'Invalid email or password' }));
    const api = createApiClient({ baseUrl: '', fetch, getToken: () => 'stale-token', onUnauthorized });
    await expect(api.login('a@b.co', 'x')).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('login surfaces the 429 message', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(429, { error: 'Too many attempts. Try again in a few minutes.' }));
    await expect(createApiClient({ baseUrl: '', fetch }).login('a@b.co', 'x')).rejects.toMatchObject({
      status: 429,
      message: 'Too many attempts. Try again in a few minutes.',
    });
  });

  it('a 401 on a call that sent a token tells the app once (the session ended), and still rejects', async () => {
    const onUnauthorized = vi.fn();
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(401, { error: 'Not signed in.' }));
    const api = createApiClient({ baseUrl: '', fetch, getToken: () => 'abc', onUnauthorized });
    await expect(api.getCalendar(NOV)).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('a 401 without a token does not call onUnauthorized (nothing to sign out of)', async () => {
    const onUnauthorized = vi.fn();
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(401, { error: 'Not signed in.' }));
    await expect(createApiClient({ baseUrl: '', fetch, onUnauthorized }).getUsers()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('a 403 is an ApiError with the server message and does not sign out', async () => {
    const onUnauthorized = vi.fn();
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(403, { error: 'You do not have permission to do this.' }));
    const api = createApiClient({ baseUrl: '', fetch, getToken: () => 'abc', onUnauthorized });
    await expect(api.getUsers()).rejects.toMatchObject({ status: 403, message: 'You do not have permission to do this.' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('getMe maps the session; logout posts and resolves', async () => {
    const fetch = vi.fn<FetchLike>(async (url) => jsonResponse(200, url.endsWith('/logout') ? { ok: true } : sessionDto));
    const api = createApiClient({ baseUrl: 'https://example.com', fetch, getToken: () => 'abc' });
    expect(await api.getMe()).toEqual(sessionDto);
    await expect(api.logout()).resolves.toBeUndefined();
    expect(fetch.mock.calls[1]![0]).toBe('https://example.com/api/auth/logout');
    expect(fetch.mock.calls[1]![1]!.method).toBe('POST');
  });

  it('logoutAll posts to /api/auth/logout-all with the token and resolves', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, { ok: true }));
    const api = createApiClient({ baseUrl: 'https://example.com', fetch, getToken: () => 'abc' });
    await expect(api.logoutAll()).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![0]).toBe('https://example.com/api/auth/logout-all');
    expect(fetch.mock.calls[0]![1]!.method).toBe('POST');
  });

  it('being offline is an ApiError with status 0 (the app keeps the token and offers to retry)', async () => {
    const offline = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await createApiClient({ baseUrl: '', fetch: offline, getToken: () => 'abc' }).getMe().catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
  });

  it('login without a token in the answer is rejected', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, sessionDto));
    await expect(createApiClient({ baseUrl: '', fetch }).login('a@b.co', 'x')).rejects.toMatchObject({ status: 0 });
  });
});

describe('mapSessionResponse', () => {
  it('keeps only known fields and string permissions', () => {
    const s = mapSessionResponse({ ...sessionDto, permissions: ['can_view_user', 5, null], token: 'x', extra: 1 });
    expect(s).toEqual({ ...sessionDto, permissions: ['can_view_user'] });
  });

  it('throws for anything that is not a session, so a bad answer never looks signed in', () => {
    for (const bad of [null, 'x', {}, { user: null }, { ...sessionDto, user: { ...sessionDto.user, id: 5 } }, { ...sessionDto, permissions: 'all' }, { ...sessionDto, expiresAt: 1 }]) {
      expect(() => mapSessionResponse(bad)).toThrow(ApiError);
    }
  });
});

describe('createApiClient: users and roles for the forms', () => {
  const userDto = {
    id: '9',
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'Petrovic',
    phone: null,
    role: 'manager',
    isActive: true,
    lastLoginAt: null,
    passwordHash: '$2b$12$leaked', // the server never sends it; the client must not carry it
  };
  const mappedUser = { id: '9', email: 'ana@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: null, role: 'manager', isActive: true, lastLoginAt: null };

  it('getUser asks for one user by id and maps it without anything extra', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, userDto));
    const user = await createApiClient({ baseUrl: 'https://example.com', fetch, getToken: () => 'abc' }).getUser('9');
    expect(fetch.mock.calls[0]![0]).toBe('https://example.com/api/users?id=9');
    expect(user).toEqual(mappedUser);
    expect(JSON.stringify(user)).not.toContain('leaked');
  });

  it('getUser: 404 is an ApiError, and an answer that is not a user is an ApiError too', async () => {
    const missing = vi.fn<FetchLike>(async () => jsonResponse(404, { error: 'User not found.' }));
    await expect(createApiClient({ baseUrl: '', fetch: missing, getToken: () => 'abc' }).getUser('99')).rejects.toMatchObject({ status: 404, message: 'User not found.' });
    const odd = vi.fn<FetchLike>(async () => jsonResponse(200, { nonsense: true }));
    await expect(createApiClient({ baseUrl: '', fetch: odd, getToken: () => 'abc' }).getUser('9')).rejects.toMatchObject({ status: 0 });
  });

  it('getRoles maps id and name and skips anything else', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, [{ id: '1', name: 'admin', description: 'x' }, { id: 2, name: 'bad' }, { id: '3', name: 'manager' }]));
    const roles = await createApiClient({ baseUrl: '', fetch, getToken: () => 'abc' }).getRoles();
    expect(fetch.mock.calls[0]![0]).toBe('/api/roles');
    expect(roles).toEqual([{ id: '1', name: 'admin' }, { id: '3', name: 'manager' }]);
  });

  it('createUser posts the request as JSON with the token and returns the new user', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(201, userDto));
    const request = { email: 'ana@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: null, roleId: '3', password: 'Correct-horse-9battery' };
    const user = await createApiClient({ baseUrl: 'https://example.com', fetch, getToken: () => 'abc' }).createUser(request);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://example.com/api/users/create');
    expect(init!.method).toBe('POST');
    expect(init!.headers!.Authorization).toBe('Bearer abc');
    expect(JSON.parse(init!.body!)).toEqual(request);
    expect(user).toEqual(mappedUser);
  });

  it('updateUser posts to the edit route and returns the updated user', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, { ...userDto, firstName: 'Anka' }));
    const user = await createApiClient({ baseUrl: '', fetch, getToken: () => 'abc' }).updateUser({ id: '9', firstName: 'Anka' });
    expect(fetch.mock.calls[0]![0]).toBe('/api/users/edit');
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body!)).toEqual({ id: '9', firstName: 'Anka' });
    expect(user.firstName).toBe('Anka');
  });

  it('a rejected form carries the message per field on the ApiError (400, 409 and 403)', async () => {
    const rejected = (status: number, body: unknown) => vi.fn<FetchLike>(async () => jsonResponse(status, body));
    const request = { email: 'x', firstName: '', lastName: '', phone: null, roleId: '', password: '' };

    const bad = await createApiClient({ baseUrl: '', fetch: rejected(400, { error: 'Please correct the highlighted fields.', fields: { email: 'Enter a valid email address.', password: 3 } }), getToken: () => 'abc' })
      .createUser(request)
      .catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(ApiError);
    expect(bad).toMatchObject({ status: 400, message: 'Please correct the highlighted fields.', fields: { email: 'Enter a valid email address.' } }); // a non-text value is dropped

    const taken = await createApiClient({ baseUrl: '', fetch: rejected(409, { error: 'A user with this email already exists.', fields: { email: 'This email is already in use.' } }), getToken: () => 'abc' })
      .createUser(request)
      .catch((e: unknown) => e);
    expect(taken).toMatchObject({ status: 409, fields: { email: 'This email is already in use.' } });

    const own = await createApiClient({ baseUrl: '', fetch: rejected(403, { error: 'You cannot change your own role.', fields: { roleId: 'You cannot change your own role.' } }), getToken: () => 'abc' })
      .updateUser({ id: '5', roleId: '2' })
      .catch((e: unknown) => e);
    expect(own).toMatchObject({ status: 403, fields: { roleId: 'You cannot change your own role.' } });
  });

  it('an error without fields has no fields property content', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(500, { error: 'Could not create the user.' }));
    const err = await createApiClient({ baseUrl: '', fetch, getToken: () => 'abc' }).createUser({ email: 'a@b.co', firstName: 'A', lastName: 'B', phone: null, roleId: '1', password: 'x' }).catch((e: unknown) => e);
    expect((err as ApiError).fields).toBeUndefined();
  });
});
