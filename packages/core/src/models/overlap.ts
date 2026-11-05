import type { ISODate, Reservation } from './types';

export interface DateRange {
  checkIn: ISODate;
  checkOut: ISODate;
}

export interface BookingCandidate extends DateRange {
  apartmentId: string;
  /** Set when editing an existing reservation, so it doesn't conflict with itself. */
  id?: string;
}

/**
 * Half-open ranges [checkIn, checkOut): same-day changeover does not overlap.
 * `YYYY-MM-DD` strings compare correctly lexicographically.
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.checkIn < b.checkOut && a.checkOut > b.checkIn;
}

/** Returns the first active reservation that blocks the candidate, if any. */
export function findConflict(
  candidate: BookingCandidate,
  existing: readonly Reservation[],
): Reservation | undefined {
  return existing.find(
    (r) =>
      r.status !== 'cancelled' &&
      r.apartmentId === candidate.apartmentId &&
      (candidate.id === undefined || r.id !== candidate.id) &&
      rangesOverlap(candidate, r),
  );
}
