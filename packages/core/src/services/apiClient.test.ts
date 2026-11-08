import { describe, expect, it, vi } from 'vitest';
import { toYearMonth } from '../models/date';
import { ApiError, createApiClient, mapApartmentsResponse, mapUsersResponse, type FetchLike } from './apiClient';

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
