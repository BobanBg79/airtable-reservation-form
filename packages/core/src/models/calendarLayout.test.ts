import { describe, expect, it } from 'vitest';
import { layoutMonth } from './calendarLayout';
import { toISODate as d, toYearMonth } from './date';
import type { Reservation } from './types';

const NOV = toYearMonth('2026-11'); // 30 days

const res = (id: string, checkIn: string, checkOut: string, over: Partial<Reservation> = {}): Reservation => ({
  id,
  apartmentId: 'atlas',
  guest: id,
  checkIn: d(checkIn),
  checkOut: d(checkOut),
  status: 'active',
  ...over,
});

describe('layoutMonth', () => {
  it('draws from mid check-in day to mid check-out day', () => {
    const [bar] = layoutMonth(NOV, [res('a', '2026-11-03', '2026-11-06')]).get('atlas')!;
    expect(bar).toMatchObject({ start: 2.5, end: 5.5, continuesBefore: false, continuesAfter: false });
  });

  it('changeover bars touch but do not overlap', () => {
    const bars = layoutMonth(NOV, [res('b', '2026-11-06', '2026-11-08'), res('a', '2026-11-03', '2026-11-06')]).get('atlas')!;
    expect(bars.map((b) => b.reservation.id)).toEqual(['a', 'b']); // sorted by start
    expect(bars[0]!.end).toBe(bars[1]!.start);
  });

  it('clips stays that start in the previous month', () => {
    const [bar] = layoutMonth(NOV, [res('a', '2026-10-28', '2026-11-03')]).get('atlas')!;
    expect(bar).toMatchObject({ start: 0, end: 2.5, continuesBefore: true, continuesAfter: false });
  });

  it('clips stays that end in the next month', () => {
    const [bar] = layoutMonth(NOV, [res('a', '2026-11-28', '2026-12-04')]).get('atlas')!;
    expect(bar).toMatchObject({ start: 27.5, end: 30, continuesBefore: false, continuesAfter: true });
  });

  it('a stay checking out on the 1st still shows its last half-day', () => {
    const [bar] = layoutMonth(NOV, [res('a', '2026-10-25', '2026-11-01')]).get('atlas')!;
    expect(bar).toMatchObject({ start: 0, end: 0.5, continuesBefore: true });
  });

  it('a stay checking in on the last day shows its first half-day', () => {
    const [bar] = layoutMonth(NOV, [res('a', '2026-11-30', '2026-12-02')]).get('atlas')!;
    expect(bar).toMatchObject({ start: 29.5, end: 30, continuesAfter: true });
  });

  it('spans the whole month', () => {
    const [bar] = layoutMonth(NOV, [res('a', '2026-10-01', '2027-01-01')]).get('atlas')!;
    expect(bar).toMatchObject({ start: 0, end: 30, continuesBefore: true, continuesAfter: true });
  });

  it('drops stays outside the month and cancelled stays', () => {
    const map = layoutMonth(NOV, [
      res('before', '2026-10-01', '2026-10-31'),
      res('after', '2026-12-01', '2026-12-05'),
      res('cancelled', '2026-11-10', '2026-11-12', { status: 'cancelled' }),
    ]);
    expect(map.size).toBe(0);
  });

  it('groups by apartment', () => {
    const map = layoutMonth(NOV, [res('a', '2026-11-01', '2026-11-03'), res('b', '2026-11-01', '2026-11-03', { apartmentId: 'luna' })]);
    expect([...map.keys()].sort()).toEqual(['atlas', 'luna']);
  });
});
