import { isValidISODate, isValidYearMonth } from '../models/date';
import type { Apartment, ISODate, Reservation, YearMonth } from '../models/types';

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

  return {
    async getCalendar(month) {
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await doFetch(`${base}/api/calendar?month=${encodeURIComponent(month)}`, {
          headers: { Accept: 'application/json' },
        });
      } catch {
        throw new ApiError('No connection. Check your internet and try again.', 0);
      }
      if (!res.ok) throw new ApiError(await readError(res, 'Could not load calendar.'), res.status);
      return mapCalendarResponse((await res.json()) as CalendarResponseDto, month);
    },
  };
}
