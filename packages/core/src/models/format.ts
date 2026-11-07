import { dayOfWeek, nightsBetween, parseISODate } from './date';
import type { ISODate, YearMonth } from './types';

/** English, locale-independent formatting (Hermes/Intl differences don't matter here). */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "November 2026" */
export function formatMonthTitle(month: YearMonth): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Mon" */
export function formatWeekdayShort(date: ISODate): string {
  return WEEKDAYS_SHORT[dayOfWeek(date)]!;
}

/** "Thu, 5 Nov 2026" */
export function formatDisplayDate(date: ISODate): string {
  const { year, month, day } = parseISODate(date);
  return `${formatWeekdayShort(date)}, ${day} ${MONTHS[month - 1]!.slice(0, 3)} ${year}`;
}

/** "1 night" / "4 nights" */
export function formatNights(checkIn: ISODate, checkOut: ISODate): string {
  const n = nightsBetween(checkIn, checkOut);
  return `${n} ${n === 1 ? 'night' : 'nights'}`;
}

/** "38 m²" */
export function formatArea(m2: number): string {
  return `${m2} m²`;
}

/** "€350", "€1,250", "€1,250.50" (whole amounts have no decimals). */
export function formatEur(amount: number): string {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const [whole, decimals] = fixed.split('.') as [string, string | undefined];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `€${grouped}${decimals ? `.${decimals}` : ''}`;
}
