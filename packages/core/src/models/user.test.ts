import { describe, expect, it } from 'vitest';
import { formatLastLogin, formatRole, userFullName, userInitials } from './user';

describe('user helpers', () => {
  it('builds the full name and the initials', () => {
    expect(userFullName({ firstName: 'Ana', lastName: 'Petrovic' })).toBe('Ana Petrovic');
    expect(userInitials({ firstName: 'ana', lastName: 'petrovic' })).toBe('AP');
    expect(userInitials({ firstName: '', lastName: '' })).toBe('?');
  });

  it('writes a role name as a label', () => {
    expect(formatRole('admin')).toBe('Admin');
    expect(formatRole('business_owner')).toBe('Business owner');
    expect(formatRole('cleaning_lady')).toBe('Cleaning lady');
  });

  it('says when a user last signed in, in Belgrade time', () => {
    expect(formatLastLogin(null)).toBe('Never signed in');
    expect(formatLastLogin('not a date')).toBe('Never signed in');
    expect(formatLastLogin('2026-11-08T10:00:00.000Z')).toBe('Last signed in Sun, 8 Nov 2026');
    // 23:30 UTC is already the next day in Belgrade (UTC+1 in November).
    expect(formatLastLogin('2026-11-08T23:30:00.000Z')).toBe('Last signed in Mon, 9 Nov 2026');
  });
});
