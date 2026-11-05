import { describe, expect, it } from 'vitest';
import { toISODate as d } from './date';
import { findConflict, rangesOverlap } from './overlap';
import type { Reservation } from './types';

const range = (checkIn: string, checkOut: string) => ({ checkIn: d(checkIn), checkOut: d(checkOut) });

describe('rangesOverlap', () => {
  const existing = range('2026-07-10', '2026-07-15');

  it.each([
    ['identical', range('2026-07-10', '2026-07-15')],
    ['starts inside', range('2026-07-12', '2026-07-20')],
    ['ends inside', range('2026-07-05', '2026-07-11')],
    ['contained', range('2026-07-11', '2026-07-13')],
    ['contains', range('2026-07-01', '2026-07-31')],
    ['same check-in', range('2026-07-10', '2026-07-11')],
    ['same check-out', range('2026-07-14', '2026-07-15')],
  ])('overlaps: %s', (_, candidate) => {
    expect(rangesOverlap(candidate, existing)).toBe(true);
    expect(rangesOverlap(existing, candidate)).toBe(true);
  });

  it.each([
    ['changeover: new arrives on existing check-out', range('2026-07-15', '2026-07-18')],
    ['changeover: new leaves on existing check-in', range('2026-07-07', '2026-07-10')],
    ['fully before', range('2026-07-01', '2026-07-05')],
    ['fully after', range('2026-07-20', '2026-07-25')],
  ])('does not overlap: %s', (_, candidate) => {
    expect(rangesOverlap(candidate, existing)).toBe(false);
    expect(rangesOverlap(existing, candidate)).toBe(false);
  });

  it('works across month boundaries', () => {
    expect(rangesOverlap(range('2026-07-30', '2026-08-02'), range('2026-08-01', '2026-08-05'))).toBe(true);
    expect(rangesOverlap(range('2026-07-30', '2026-08-01'), range('2026-08-01', '2026-08-05'))).toBe(false);
  });
});

describe('findConflict', () => {
  const res = (over: Partial<Reservation> & Pick<Reservation, 'id'>): Reservation => ({
    apartmentId: 'apt-atlas',
    guest: 'Guest',
    checkIn: d('2026-07-10'),
    checkOut: d('2026-07-15'),
    status: 'active',
    ...over,
  });

  const existing: Reservation[] = [
    res({ id: 'r1', guest: 'Marko' }),
    res({ id: 'r2', apartmentId: 'apt-luna', guest: 'Ana' }),
    res({ id: 'r3', guest: 'Cancelled guest', checkIn: d('2026-07-20'), checkOut: d('2026-07-25'), status: 'cancelled' }),
  ];

  it('finds an overlapping booking in the same apartment', () => {
    const conflict = findConflict({ apartmentId: 'apt-atlas', ...range('2026-07-12', '2026-07-14') }, existing);
    expect(conflict?.id).toBe('r1');
  });

  it('ignores other apartments', () => {
    expect(findConflict({ apartmentId: 'apt-mona', ...range('2026-07-12', '2026-07-14') }, existing)).toBeUndefined();
  });

  it('ignores cancelled bookings', () => {
    expect(findConflict({ apartmentId: 'apt-atlas', ...range('2026-07-20', '2026-07-25') }, existing)).toBeUndefined();
  });

  it('allows same-day changeover', () => {
    expect(findConflict({ apartmentId: 'apt-atlas', ...range('2026-07-15', '2026-07-18') }, existing)).toBeUndefined();
    expect(findConflict({ apartmentId: 'apt-atlas', ...range('2026-07-05', '2026-07-10') }, existing)).toBeUndefined();
  });

  it('does not conflict with itself when editing', () => {
    expect(
      findConflict({ id: 'r1', apartmentId: 'apt-atlas', ...range('2026-07-11', '2026-07-16') }, existing),
    ).toBeUndefined();
  });

  it('still conflicts with others when editing', () => {
    const withNeighbour = [...existing, res({ id: 'r4', checkIn: d('2026-07-15'), checkOut: d('2026-07-18') })];
    const conflict = findConflict({ id: 'r1', apartmentId: 'apt-atlas', ...range('2026-07-10', '2026-07-16') }, withNeighbour);
    expect(conflict?.id).toBe('r4');
  });

  it('returns undefined for an empty list', () => {
    expect(findConflict({ apartmentId: 'apt-atlas', ...range('2026-07-10', '2026-07-15') }, [])).toBeUndefined();
  });
});
