import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dayOfWeek,
  daysInMonth,
  isValidISODate,
  isValidYearMonth,
  isWeekend,
  monthDays,
  monthOf,
  nightsBetween,
  parseISODate,
  toISODate,
  todayInBelgrade,
  toYearMonth,
} from './date';

const d = toISODate;
const ym = toYearMonth;

describe('isValidISODate / toISODate', () => {
  it.each(['2026-01-01', '2024-02-29', '2026-12-31'])('accepts %s', (v) => {
    expect(isValidISODate(v)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '01.01.2026', '', '2026-01-01T00:00:00Z'])(
    'rejects %s',
    (v) => {
      expect(isValidISODate(v)).toBe(false);
    },
  );

  it('rejects non-strings', () => {
    expect(isValidISODate(20260101)).toBe(false);
    expect(isValidISODate(null)).toBe(false);
  });

  it('toISODate throws on invalid input', () => {
    expect(() => toISODate('2026-02-30')).toThrow();
  });
});

describe('parseISODate', () => {
  it('splits into components', () => {
    expect(parseISODate(d('2026-07-09'))).toEqual({ year: 2026, month: 7, day: 9 });
  });
});

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });
  it('handles 30/31 day months', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
    expect(addDays(d('2024-02-28'), 1)).toBe('2024-02-29');
  });

  it('does not shift across DST changes (Europe/Belgrade)', () => {
    // DST starts 2026-03-29, ends 2026-10-25
    expect(addDays(d('2026-03-28'), 1)).toBe('2026-03-29');
    expect(addDays(d('2026-03-29'), 1)).toBe('2026-03-30');
    expect(addDays(d('2026-10-24'), 1)).toBe('2026-10-25');
    expect(addDays(d('2026-10-25'), 1)).toBe('2026-10-26');
  });
});

describe('nightsBetween', () => {
  it('counts nights', () => {
    expect(nightsBetween(d('2026-07-01'), d('2026-07-05'))).toBe(4);
    expect(nightsBetween(d('2026-03-28'), d('2026-03-31'))).toBe(3);
    expect(nightsBetween(d('2026-12-30'), d('2027-01-02'))).toBe(3);
    expect(nightsBetween(d('2026-07-05'), d('2026-07-01'))).toBe(-4);
  });
});

describe('dayOfWeek / isWeekend', () => {
  it('computes weekday', () => {
    expect(dayOfWeek(d('2026-11-05'))).toBe(4); // Thursday
  });
  it('detects weekends', () => {
    expect(isWeekend(d('2026-11-07'))).toBe(true); // Sat
    expect(isWeekend(d('2026-11-08'))).toBe(true); // Sun
    expect(isWeekend(d('2026-11-09'))).toBe(false); // Mon
  });
});

describe('months', () => {
  it('validates YYYY-MM', () => {
    expect(isValidYearMonth('2026-11')).toBe(true);
    expect(isValidYearMonth('2026-13')).toBe(false);
    expect(isValidYearMonth('2026-1')).toBe(false);
  });

  it('monthOf', () => {
    expect(monthOf(d('2026-11-05'))).toBe('2026-11');
  });

  it('addMonths crosses year boundaries', () => {
    expect(addMonths(ym('2026-12'), 1)).toBe('2027-01');
    expect(addMonths(ym('2026-01'), -1)).toBe('2025-12');
    expect(addMonths(ym('2026-05'), 14)).toBe('2027-07');
    expect(addMonths(ym('2026-05'), -17)).toBe('2024-12');
  });

  it('monthDays lists every day', () => {
    const feb = monthDays(ym('2024-02'));
    expect(feb).toHaveLength(29);
    expect(feb[0]).toBe('2024-02-01');
    expect(feb.at(-1)).toBe('2024-02-29');
    expect(monthDays(ym('2026-04'))).toHaveLength(30);
  });
});

describe('todayInBelgrade', () => {
  it('uses Belgrade winter time (UTC+1)', () => {
    expect(todayInBelgrade(new Date('2026-11-05T22:59:00Z'))).toBe('2026-11-05');
    expect(todayInBelgrade(new Date('2026-11-05T23:00:00Z'))).toBe('2026-11-06');
  });

  it('uses Belgrade summer time (UTC+2)', () => {
    expect(todayInBelgrade(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(todayInBelgrade(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });

  it('handles new year', () => {
    expect(todayInBelgrade(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
