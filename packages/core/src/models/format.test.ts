import { describe, expect, it } from 'vitest';
import { toISODate as d, toYearMonth } from './date';
import { formatArea, formatDisplayDate, formatEur, formatMonthTitle, formatNights, formatWeekdayShort } from './format';

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

  it('formatArea', () => {
    expect(formatArea(38)).toBe('38 m²');
  });

  it('formatEur groups thousands and only shows decimals when needed', () => {
    expect(formatEur(0)).toBe('€0');
    expect(formatEur(350)).toBe('€350');
    expect(formatEur(1250)).toBe('€1,250');
    expect(formatEur(1234567)).toBe('€1,234,567');
    expect(formatEur(1250.5)).toBe('€1,250.50');
  });
});
