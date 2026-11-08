import { describe, expect, it } from 'vitest';
import { can, INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from './permissions';

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
