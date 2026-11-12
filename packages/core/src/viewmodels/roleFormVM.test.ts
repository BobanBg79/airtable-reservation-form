import { describe, expect, it, vi } from 'vitest';
import type { RoleWithPermissions } from '../models/types';
import { ApiError } from '../services/apiClient';
import { createRoleFormVM, type RoleFormApi } from './roleFormVM';

const NAMES = ['can_view_apartment', 'can_edit_apartment', 'can_view_reservation', 'can_view_user', 'can_edit_role'];

const manager: RoleWithPermissions = { id: '3', name: 'manager', isProtected: false, permissions: ['can_view_apartment', 'can_view_reservation'] };
const admin: RoleWithPermissions = { id: '1', name: 'admin', isProtected: true, permissions: NAMES };

// The API is the outside world: a fake that answers, never one that decides.
function fakeApi(over: Partial<RoleFormApi> = {}): RoleFormApi & { updateRole: ReturnType<typeof vi.fn> } {
  return { updateRole: vi.fn(async (u) => ({ ...manager, permissions: u.permissions })), ...over } as never;
}

describe('a role that can be edited', () => {
  it('opens read-only with a switch per permission set as the role has it, and Edit for someone who may edit roles', () => {
    const s = createRoleFormVM({ api: fakeApi(), permissionNames: NAMES, role: manager, canEdit: true }).getState();
    expect(s.mode).toBe('view');
    expect(s.values).toEqual({ can_view_apartment: true, can_edit_apartment: false, can_view_reservation: true, can_view_user: false, can_edit_role: false });
    expect(s.canEdit).toBe(true);
    expect(s.canSave).toBe(false);
  });

  it('without can_edit_role there is no Edit', () => {
    expect(createRoleFormVM({ api: fakeApi(), permissionNames: NAMES, role: manager, canEdit: false }).getState().canEdit).toBe(false);
  });

  it('Edit unlocks the ordinary permissions and keeps the users and roles permissions locked (they are the admin\'s alone)', () => {
    const form = createRoleFormVM({ api: fakeApi(), permissionNames: NAMES, role: manager, canEdit: true });
    form.startEdit();
    expect(form.getState().editable).toEqual({ can_view_apartment: true, can_edit_apartment: true, can_view_reservation: true, can_view_user: false, can_edit_role: false });
    form.setValue('can_view_user', true);
    expect(form.getState().values.can_view_user).toBe(false);
  });

  it('Save is off until a switch changes, and then sends the COMPLETE new set of names', async () => {
    const api = fakeApi();
    const form = createRoleFormVM({ api, permissionNames: NAMES, role: manager, canEdit: true });
    form.startEdit();
    expect(form.getState().canSave).toBe(false);
    form.setValue('can_edit_apartment', true);
    form.setValue('can_view_reservation', false);
    expect(form.getState().canSave).toBe(true);
    await form.submit();
    expect(api.updateRole).toHaveBeenCalledWith({ id: '3', permissions: ['can_view_apartment', 'can_edit_apartment'] });
    expect(form.getState().mode).toBe('view');
    expect(form.getState().values).toEqual({ can_view_apartment: true, can_edit_apartment: true, can_view_reservation: false, can_view_user: false, can_edit_role: false });
  });

  it('Cancel puts every switch back as it was', () => {
    const form = createRoleFormVM({ api: fakeApi(), permissionNames: NAMES, role: manager, canEdit: true });
    form.startEdit();
    form.setValue('can_edit_apartment', true);
    form.setValue('can_view_apartment', false);
    form.cancel();
    expect(form.getState().mode).toBe('view');
    expect(form.getState().values).toEqual({ can_view_apartment: true, can_edit_apartment: false, can_view_reservation: true, can_view_user: false, can_edit_role: false });
  });

  it('a refusal by the server shows in the banner and the role stays in edit mode', async () => {
    const api = fakeApi({ updateRole: vi.fn(async () => { throw new ApiError('Only the admin can have can_view_user.', 403, { permissions: 'Only the admin can have can_view_user.' }); }) });
    const form = createRoleFormVM({ api, permissionNames: NAMES, role: manager, canEdit: true });
    form.startEdit();
    form.setValue('can_edit_apartment', true);
    await form.submit();
    expect(form.getState().formError).toBe('Only the admin can have can_view_user.');
    expect(form.getState().mode).toBe('edit');
  });
});

describe('the admin role', () => {
  it('shows all its permissions on and never has Edit, even for someone who may edit roles', () => {
    const s = createRoleFormVM({ api: fakeApi(), permissionNames: NAMES, role: admin, canEdit: true }).getState();
    expect(s.values).toEqual({ can_view_apartment: true, can_edit_apartment: true, can_view_reservation: true, can_view_user: true, can_edit_role: true });
    expect(s.canEdit).toBe(false);
    expect(s.editable).toEqual({ can_view_apartment: false, can_edit_apartment: false, can_view_reservation: false, can_view_user: false, can_edit_role: false });
  });
});
