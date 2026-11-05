import { addMonths, monthDays, nightsBetween } from './date';
import type { ISODate, Reservation, YearMonth } from './types';

/**
 * A reservation's visible piece within one month grid.
 * `start` / `end` are measured in day columns from the month's first day (fractional):
 * a stay is drawn from the middle of the check-in day to the middle of the check-out day,
 * so a same-day changeover shows two bars meeting in one cell, not overlapping.
 */
export interface BarSegment {
  reservation: Reservation;
  start: number;
  end: number;
  /** Stay began before this month (draw a flat left edge). */
  continuesBefore: boolean;
  /** Stay ends after this month (draw a flat right edge). */
  continuesAfter: boolean;
}

export function monthRange(month: YearMonth): { first: ISODate; nextFirst: ISODate } {
  return { first: `${month}-01` as ISODate, nextFirst: `${addMonths(month, 1)}-01` as ISODate };
}

/** Bars per apartment for the given month. Cancelled stays and stays outside the month are dropped. */
export function layoutMonth(
  month: YearMonth,
  reservations: readonly Reservation[],
): Map<string, BarSegment[]> {
  const days = monthDays(month).length;
  const { first } = monthRange(month);
  const result = new Map<string, BarSegment[]>();

  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const rawStart = nightsBetween(first, r.checkIn) + 0.5;
    const rawEnd = nightsBetween(first, r.checkOut) + 0.5;
    if (rawEnd <= 0 || rawStart >= days) continue;

    const continuesBefore = rawStart < 0;
    const continuesAfter = rawEnd > days;
    const segment: BarSegment = {
      reservation: r,
      start: continuesBefore ? 0 : rawStart,
      end: continuesAfter ? days : rawEnd,
      continuesBefore,
      continuesAfter,
    };
    const list = result.get(r.apartmentId) ?? [];
    list.push(segment);
    result.set(r.apartmentId, list);
  }

  for (const list of result.values()) list.sort((a, b) => a.start - b.start);
  return result;
}
