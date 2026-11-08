import { describe, expect, it } from 'vitest';
import { can, canOpenScreen, INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES, SCREEN_PERMISSIONS } from './permissions';

describe('permissions list', () => {
  it('has 19 unique names in the can_<action>_<entity> form', () => {
    expect(PERMISSIONS).toHaveLength(19);
    expect(new Set(PERMISSIONS).size).toBe(19);
    for (const p of PERMISSIONS) expect(p).toMatch(/^can_(view|create|edit)_[a-z]+(_[a-z]+)*$/);
  });

  it('has five roles', () => {
    expect(ROLES).toEqual(['admin', 'business_owner', 'manager', 'cleaning_lady', 'handyman']);
  });

  it('gives sub-entities view and edit only', () => {
    expect(PERMISSIONS.filter((p) => /_(owner_contact|rent)$/.test(p)).sort()).toEqual([
      'can_edit_apartment_owner_contact',
      'can_edit_apartment_rent',
      'can_view_apartment_owner_contact',
      'can_view_apartment_rent',
    ]);
  });
});

describe('initial role permissions', () => {
  it('gives admin all 19', () => {
    expect([...INITIAL_ROLE_PERMISSIONS.admin].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives business_owner and manager 16: everything except the user permissions', () => {
    for (const role of ['business_owner', 'manager'] as const) {
      const set = INITIAL_ROLE_PERMISSIONS[role];
      expect(set).toHaveLength(16);
      expect(set.filter((p) => p.endsWith('_user'))).toEqual([]);
    }
  });

  it('gives cleaning_lady and handyman none for now', () => {
    expect(INITIAL_ROLE_PERMISSIONS.cleaning_lady).toEqual([]);
    expect(INITIAL_ROLE_PERMISSIONS.handyman).toEqual([]);
  });

  it('has an entry for every role', () => {
    expect(Object.keys(INITIAL_ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });
});

describe('can', () => {
  it('checks the granted names', () => {
    expect(can(['can_view_user'], 'can_view_user')).toBe(true);
    expect(can(['can_view_user'], 'can_edit_user')).toBe(false);
  });

  it('is false without a list', () => {
    expect(can(null, 'can_view_user')).toBe(false);
    expect(can(undefined, 'can_view_user')).toBe(false);
  });
});

describe('screen permissions', () => {
  it('maps the three screens to their view permissions', () => {
    expect(SCREEN_PERMISSIONS).toEqual({
      calendar: 'can_view_reservation',
      apartments: 'can_view_apartment',
      users: 'can_view_user',
    });
    for (const p of Object.values(SCREEN_PERMISSIONS)) expect(PERMISSIONS).toContain(p);
  });

  it('shows each role the tabs its permissions allow', () => {
    const open = (role: (typeof ROLES)[number]) =>
      (['calendar', 'apartments', 'users'] as const).filter((s) => canOpenScreen(INITIAL_ROLE_PERMISSIONS[role], s));
    expect(open('admin')).toEqual(['calendar', 'apartments', 'users']);
    expect(open('business_owner')).toEqual(['calendar', 'apartments']);
    expect(open('manager')).toEqual(['calendar', 'apartments']);
    expect(open('cleaning_lady')).toEqual([]);
    expect(open('handyman')).toEqual([]);
  });

  it('is closed for a missing permission list', () => {
    expect(canOpenScreen(undefined, 'users')).toBe(false);
    expect(canOpenScreen([], 'calendar')).toBe(false);
  });
});
