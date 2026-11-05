import { describe, expect, it } from 'vitest';
import { toISODate as d, toYearMonth } from './date';
import { formatDisplayDate, formatMonthTitle, formatNights, formatWeekdayShort } from './format';

describe('format', () => {
  it('formatMonthTitle', () => {
    expect(formatMonthTitle(toYearMonth('2026-11'))).toBe('November 2026');
    expect(formatMonthTitle(toYearMonth('2027-01'))).toBe('January 2027');
  });

  it('formatWeekdayShort', () => {
    expect(formatWeekdayShort(d('2026-11-05'))).toBe('Thu');
    expect(formatWeekdayShort(d('2026-11-08'))).toBe('Sun');
  });

  it('formatDisplayDate', () => {
    expect(formatDisplayDate(d('2026-11-05'))).toBe('Thu, 5 Nov 2026');
  });

  it('formatNights', () => {
    expect(formatNights(d('2026-07-01'), d('2026-07-02'))).toBe('1 night');
    expect(formatNights(d('2026-07-01'), d('2026-07-05'))).toBe('4 nights');
  });
});
