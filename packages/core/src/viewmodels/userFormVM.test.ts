import { describe, expect, it, vi } from 'vitest';
import type { RoleOption, UserSummary } from '../models/types';
import { ApiError } from '../services/apiClient';
import { createUserFormVM, type UserFormApi } from './userFormVM';

const roles: RoleOption[] = [
  { id: '1', name: 'admin' },
  { id: '2', name: 'business_owner' },
  { id: '3', name: 'manager' },
];

const ana: UserSummary = {
  id: '9',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Petrovic',
  phone: '+381601234567',
  role: 'manager',
  isActive: true,
  lastLoginAt: null,
};

// The API is the outside world: a fake that answers, never one that decides.
function fakeApi(over: Partial<UserFormApi> = {}): UserFormApi & { createUser: ReturnType<typeof vi.fn>; updateUser: ReturnType<typeof vi.fn> } {
  return {
    createUser: vi.fn(async () => ana),
    updateUser: vi.fn(async (u) => ({ ...ana, firstName: u.firstName ?? ana.firstName })),
    ...over,
  } as never;
}

describe('Add user', () => {
  it('shows the required fields as required, the phone as optional, and Save off', () => {
    const s = createUserFormVM({ api: fakeApi(), roles, canEdit: true }).getState();
    expect(s.mode).toBe('create');
    expect(s.required).toEqual({ email: true, firstName: true, lastName: true, phone: false, roleId: true, password: true, isActive: false });
    expect(s.canSave).toBe(false);
  });

  it('Save turns on when email, names, role and password are filled, and the message on blur is the field message', () => {
    const form = createUserFormVM({ api: fakeApi(), roles, canEdit: true });
    form.setValue('email', 'ana@example.com');
    form.setValue('firstName', 'Ana');
    form.setValue('lastName', 'Petrovic');
    form.setValue('roleId', '3');
    expect(form.getState().canSave).toBe(false);
    form.setValue('password', 'weak');
    expect(form.getState().canSave).toBe(true); // filled; the password is checked when it is left or on Save
    form.blur('password');
    expect(form.getState().errors.password).toBe(
      'The password must be at least 10 characters long. The password needs an uppercase letter. The password needs a digit. The password needs a special character, such as !',
    );
    form.setValue('email', 'nope');
    form.blur('email');
    expect(form.getState().errors.email).toBe('Enter a valid email address.');
  });

  it('Save sends the cleaned request and then shows the new user read-only', async () => {
    const api = fakeApi();
    const form = createUserFormVM({ api, roles, canEdit: true });
    form.setValue('email', ' Ana@Example.COM ');
    form.setValue('firstName', ' Ana ');
    form.setValue('lastName', 'Petrovic');
    form.setValue('roleId', '3');
    form.setValue('password', 'Correct-horse-9battery');
    expect(await form.submit()).toEqual(ana);
    expect(api.createUser).toHaveBeenCalledWith({
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Petrovic',
      phone: null,
      roleId: '3',
      password: 'Correct-horse-9battery',
    });
    const s = form.getState();
    expect(s.mode).toBe('view');
    expect(s.values).toEqual({ email: 'ana@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: '+381601234567', roleId: '3', password: '', isActive: true });
    expect(s.visible.password).toBe(false);
  });

  it('a taken email comes back as a message on the email field and in the banner', async () => {
    const api = fakeApi({ createUser: vi.fn(async () => { throw new ApiError('A user with this email already exists.', 409, { email: 'This email is already in use.' }); }) });
    const form = createUserFormVM({ api, roles, canEdit: true });
    form.setValue('email', 'ana@example.com');
    form.setValue('firstName', 'Ana');
    form.setValue('lastName', 'Petrovic');
    form.setValue('roleId', '3');
    form.setValue('password', 'Correct-horse-9battery');
    await form.submit();
    expect(form.getState().errors).toEqual({ email: 'This email is already in use.' });
    expect(form.getState().formError).toBe('A user with this email already exists.');
  });
});

describe('User details and edit', () => {
  it('opens read-only with the saved values (the role as its id), the password hidden, and Edit for an admin', () => {
    const s = createUserFormVM({ api: fakeApi(), roles, user: ana, canEdit: true }).getState();
    expect(s.mode).toBe('view');
    expect(s.values).toEqual({ email: 'ana@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: '+381601234567', roleId: '3', password: '', isActive: true });
    expect(s.visible.password).toBe(false);
    expect(s.canEdit).toBe(true);
    expect(createUserFormVM({ api: fakeApi(), roles, user: ana, canEdit: false }).getState().canEdit).toBe(false);
  });

  it('Edit unlocks everything except the email; the password is optional and shown', () => {
    const form = createUserFormVM({ api: fakeApi(), roles, user: ana, canEdit: true });
    form.startEdit();
    const s = form.getState();
    expect(s.editable).toEqual({ email: false, firstName: true, lastName: true, phone: true, roleId: true, password: true, isActive: true });
    expect(s.required).toEqual({ email: false, firstName: true, lastName: true, phone: false, roleId: true, password: false, isActive: false });
    expect(s.visible.password).toBe(true);
    expect(s.canSave).toBe(false);
  });

  it('Save sends only what changed, including the active switch and a new password', async () => {
    const api = fakeApi();
    const form = createUserFormVM({ api, roles, user: ana, canEdit: true });
    form.startEdit();
    form.setValue('firstName', 'Anka');
    form.setValue('isActive', false);
    form.setValue('password', 'New-password-77!');
    await form.submit();
    expect(api.updateUser).toHaveBeenCalledWith({ id: '9', firstName: 'Anka', isActive: false, password: 'New-password-77!' });
    expect(form.getState().mode).toBe('view');
    expect(form.getState().values.firstName).toBe('Anka');
    expect(form.getState().values.password).toBe('');
  });

  it('a wrong new password is refused on Save without calling the API, and Cancel restores everything', async () => {
    const api = fakeApi();
    const form = createUserFormVM({ api, roles, user: ana, canEdit: true });
    form.startEdit();
    form.setValue('password', 'weak');
    expect(await form.submit()).toBeNull();
    expect(api.updateUser).not.toHaveBeenCalled();
    expect(form.getState().errors.password).toContain('at least 10');
    form.setValue('firstName', 'Changed');
    form.cancel();
    expect(form.getState().values).toEqual({ email: 'ana@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: '+381601234567', roleId: '3', password: '', isActive: true });
    expect(form.getState().errors).toEqual({});
  });

  it('the server refusing the admin to deactivate themselves shows on the switch and in the banner', async () => {
    const api = fakeApi({ updateUser: vi.fn(async () => { throw new ApiError('You cannot deactivate your own account.', 403, { isActive: 'You cannot deactivate your own account.' }); }) });
    const form = createUserFormVM({ api, roles, user: ana, canEdit: true });
    form.startEdit();
    form.setValue('isActive', false);
    await form.submit();
    expect(form.getState().errors).toEqual({ isActive: 'You cannot deactivate your own account.' });
    expect(form.getState().formError).toBe('You cannot deactivate your own account.');
    expect(form.getState().mode).toBe('edit');
  });
});
