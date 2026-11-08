import { todayInBelgrade } from './date';
import { formatDisplayDate } from './format';
import type { UserSummary } from './types';

/** "Ana Petrovic" */
export function userFullName(user: Pick<UserSummary, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/** "AP": the first letters of the first and last name, for an avatar. */
export function userInitials(user: Pick<UserSummary, 'firstName' | 'lastName'>): string {
  const first = user.firstName.trim().charAt(0);
  const last = user.lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || '?';
}

/** "business_owner" becomes "Business owner". */
export function formatRole(role: string): string {
  const text = role.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Never signed in" or "Last signed in Sun, 8 Nov 2026" (the day in Belgrade, never shifted by the device's zone). */
export function formatLastLogin(lastLoginAt: string | null): string {
  if (!lastLoginAt) return 'Never signed in';
  const instant = new Date(lastLoginAt);
  if (Number.isNaN(instant.getTime())) return 'Never signed in';
  return `Last signed in ${formatDisplayDate(todayInBelgrade(instant))}`;
}
