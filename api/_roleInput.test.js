import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_ONLY_PERMISSIONS, adminOnlyAmong, validateRoleEdit } from './_roleInput.js';

test('a good edit: the id as text or number, the permissions without duplicates', () => {
  assert.deepEqual(validateRoleEdit({ id: 3, permissions: ['can_view_apartment', 'can_view_apartment', 'can_edit_reservation'] }), {
    fields: {},
    value: { id: '3', permissions: ['can_view_apartment', 'can_edit_reservation'] },
  });
  assert.deepEqual(validateRoleEdit({ id: ' 4 ', permissions: [] }).value, { id: '4', permissions: [] });
});

test('the id must be a number; the permissions must be a list of permission names', () => {
  for (const id of [undefined, '', 'abc', '0', '-1', '1; drop table roles', '1'.repeat(30)]) {
    assert.equal(validateRoleEdit({ id, permissions: [] }).fields.id, 'Invalid role id.', JSON.stringify(id));
  }
  assert.equal(validateRoleEdit({ id: '3' }).fields.permissions, 'Send the permissions of the role as a list of names.');
  assert.equal(validateRoleEdit({ id: '3', permissions: 'can_view_user' }).fields.permissions, 'Send the permissions of the role as a list of names.');
  assert.equal(validateRoleEdit({ id: '3', permissions: Array(101).fill('can_view_user') }).fields.permissions, 'Send the permissions of the role as a list of names.');
  for (const bad of [5, 'view_user', 'can_delete_user', 'CAN_VIEW_USER', "can_view_user'; drop", null]) {
    assert.equal(validateRoleEdit({ id: '3', permissions: [bad] }).fields.permissions, 'Every permission must be a name like can_view_user.', JSON.stringify(bad));
  }
});

test('a body that is not an object is invalid', () => {
  for (const body of [undefined, null, 'x', [], 5]) assert.ok(Object.keys(validateRoleEdit(body).fields).length > 0);
});

test('the admin-only permissions are the three user and the two role permissions', () => {
  assert.deepEqual([...ADMIN_ONLY_PERMISSIONS].sort(), ['can_create_user', 'can_edit_role', 'can_edit_user', 'can_view_role', 'can_view_user']);
  assert.deepEqual(adminOnlyAmong(['can_view_apartment', 'can_edit_role', 'can_view_user']), ['can_edit_role', 'can_view_user']);
  assert.deepEqual(adminOnlyAmong(['can_view_apartment']), []);
});
