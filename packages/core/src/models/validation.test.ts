import { describe, expect, it } from 'vitest';
import { validateReservationInput, type ReservationInput } from './validation';

const valid: ReservationInput = {
  guest: 'Marko Marković',
  apartmentId: 'apt-atlas',
  checkIn: '2026-07-10',
  checkOut: '2026-07-15',
};

describe('validateReservationInput', () => {
  it('accepts a valid minimal input', () => {
    expect(validateReservationInput(valid)).toEqual({ valid: true, errors: {} });
  });

  it('accepts optional fields', () => {
    const r = validateReservationInput({ ...valid, phone: '+381 60 123 4567', amount: 250, note: 'Late arrival' });
    expect(r.valid).toBe(true);
  });

  it('requires guest, apartment and dates', () => {
    const r = validateReservationInput({ guest: '  ', apartmentId: '', checkIn: '', checkOut: '' });
    expect(r.valid).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['apartmentId', 'checkIn', 'checkOut', 'guest']);
  });

  it('rejects invalid dates', () => {
    const r = validateReservationInput({ ...valid, checkIn: '2026-02-30', checkOut: '15.07.2026' });
    expect(r.errors.checkIn).toMatch(/valid date/);
    expect(r.errors.checkOut).toMatch(/valid date/);
  });

  it('rejects check-out equal to check-in', () => {
    const r = validateReservationInput({ ...valid, checkOut: valid.checkIn });
    expect(r.errors.checkOut).toBe('Check-out must be after check-in.');
  });

  it('rejects check-out before check-in', () => {
    const r = validateReservationInput({ ...valid, checkIn: '2026-07-15', checkOut: '2026-07-10' });
    expect(r.errors.checkOut).toBe('Check-out must be after check-in.');
  });

  it('accepts a one-night stay across a year boundary', () => {
    expect(validateReservationInput({ ...valid, checkIn: '2026-12-31', checkOut: '2027-01-01' }).valid).toBe(true);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects amount %s', (amount) => {
    expect(validateReservationInput({ ...valid, amount }).errors.amount).toBeDefined();
  });

  it('treats null amount as empty', () => {
    expect(validateReservationInput({ ...valid, amount: null }).valid).toBe(true);
  });
});
