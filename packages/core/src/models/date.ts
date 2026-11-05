import type { ISODate, YearMonth } from './types';

/**
 * Date-only helpers. Dates are plain `YYYY-MM-DD` strings; all arithmetic is done on
 * calendar components (via Date.UTC on both sides), so no time-zone shift can occur.
 */

export const TIME_ZONE = 'Europe/Belgrade';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Validates and brands a string as ISODate. Throws on invalid input. */
export function toISODate(value: string): ISODate {
  if (!isValidISODate(value)) throw new Error(`Invalid date: "${value}" (expected YYYY-MM-DD)`);
  return value;
}

export function parseISODate(value: ISODate): DateParts {
  const m = ISO_DATE_RE.exec(value);
  if (!m || !isValidISODate(value)) throw new Error(`Invalid date: "${value}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatISODate({ year, month, day }: DateParts): ISODate {
  return toISODate(`${pad(year, 4)}-${pad(month)}-${pad(day)}`);
}

function toDayNumber(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromDayNumber(dayNumber: number): ISODate {
  const d = new Date(dayNumber * MS_PER_DAY);
  return formatISODate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Number of nights between check-in and check-out (negative if reversed). */
export function nightsBetween(checkIn: ISODate, checkOut: ISODate): number {
  return toDayNumber(checkOut) - toDayNumber(checkIn);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekend(date: ISODate): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

// ---- Months ----

export function isValidYearMonth(value: unknown): value is YearMonth {
  if (typeof value !== 'string') return false;
  const m = YEAR_MONTH_RE.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

export function toYearMonth(value: string): YearMonth {
  if (!isValidYearMonth(value)) throw new Error(`Invalid month: "${value}" (expected YYYY-MM)`);
  return value;
}

export function monthOf(date: ISODate): YearMonth {
  return toYearMonth(date.slice(0, 7));
}

export function addMonths(month: YearMonth, delta: number): YearMonth {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return toYearMonth(`${pad(year, 4)}-${pad(mon)}`);
}

/** All days of the month, in order. */
export function monthDays(month: YearMonth): ISODate[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = daysInMonth(y, m);
  return Array.from({ length: count }, (_, i) => formatISODate({ year: y, month: m, day: i + 1 }));
}

// ---- "Today" in Belgrade ----

const belgradeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Current calendar day in Europe/Belgrade, regardless of device time zone. */
export function todayInBelgrade(now: Date = new Date()): ISODate {
  const parts = belgradeFormatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return formatISODate({ year: get('year'), month: get('month'), day: get('day') });
}
