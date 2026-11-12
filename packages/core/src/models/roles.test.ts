import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permissions';
import { entityTitle, groupPermissions, parsePermission } from './roles';

describe('parsePermission', () => {
  it('splits a name into its action and entity, sub-entities included', () => {
    expect(parsePermission('can_view_apartment')).toEqual({ action: 'view', entity: 'apartment' });
    expect(parsePermission('can_edit_apartment_owner_contact')).toEqual({ action: 'edit', entity: 'apartment_owner_contact' });
  });

  it('is undefined for anything that is not a permission name', () => {
    for (const name of ['view_apartment', 'can_delete_user', 'can_view_', 'CAN_VIEW_USER', '']) expect(parsePermission(name)).toBeUndefined();
  });
});

describe('entityTitle', () => {
  it('writes an entity as a title', () => {
    expect(entityTitle('apartment')).toBe('Apartment');
    expect(entityTitle('apartment_owner_contact')).toBe('Apartment owner contact');
  });
});

describe('groupPermissions', () => {
  it('groups by entity in the order they first appear, with the actions in the order given', () => {
    expect(groupPermissions(['can_view_apartment', 'can_view_reservation', 'can_edit_apartment', 'can_create_reservation'])).toEqual([
      {
        entity: 'apartment',
        title: 'Apartment',
        items: [
          { name: 'can_view_apartment', label: 'View' },
          { name: 'can_edit_apartment', label: 'Edit' },
        ],
      },
      {
        entity: 'reservation',
        title: 'Reservation',
        items: [
          { name: 'can_view_reservation', label: 'View' },
          { name: 'can_create_reservation', label: 'Create' },
        ],
      },
    ]);
  });

  it('leaves out a name that is not a permission', () => {
    expect(groupPermissions(['can_view_user', 'nonsense'])).toEqual([{ entity: 'user', title: 'User', items: [{ name: 'can_view_user', label: 'View' }] }]);
  });

  it('turns the 21 real permissions into these 9 groups', () => {
    const groups = groupPermissions(PERMISSIONS);
    expect(groups.map((g) => g.entity)).toEqual([
      'apartment',
      'reservation',
      'guest',
      'cleaning',
      'user',
      'role',
      'apartment_owner_contact',
      'apartment_rent',
    ]);
    expect(groups.reduce((total, g) => total + g.items.length, 0)).toBe(21);
  });
});
