import { describe, expect, it, vi } from 'vitest';
import { toYearMonth } from '../models/date';
import { ApiError, createApiClient, type FetchLike } from './apiClient';

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
