import { describe, expect, it } from 'vitest';
import type { RoleOption, UserSummary } from './types';
import {
  EMPTY_USER_FORM,
  isRequired,
  passwordProblems,
  requiredFields,
  requiredFieldsFilled,
  toCreateUserRequest,
  toUpdateUserRequest,
  userFormFromUser,
  validateUserField,
  validateUserForm,
  type UserFormValues,
} from './userForm';

const roles: RoleOption[] = [
  { id: '1', name: 'admin' },
  { id: '2', name: 'business_owner' },
  { id: '3', name: 'manager' },
];

const filled: UserFormValues = {
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Petrovic',
  phone: '+381601234567',
  roleId: '3',
  password: 'Correct-horse-9battery',
};

const saved: UserSummary = {
  id: '9',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Petrovic',
  phone: '+381601234567',
  role: 'manager',
  isActive: true,
  lastLoginAt: null,
};

describe('required fields', () => {
  it('create requires email, names, role and password; the phone is optional', () => {
    expect(requiredFields('create')).toEqual(['email', 'firstName', 'lastName', 'roleId', 'password']);
    expect(isRequired('phone', 'create')).toBe(false);
  });

  it('edit requires names and role; the email is not a field and the password is optional', () => {
    expect(requiredFields('edit')).toEqual(['firstName', 'lastName', 'roleId']);
    expect(isRequired('email', 'edit')).toBe(false);
    expect(isRequired('password', 'edit')).toBe(false);
  });

  it('Save is allowed only when every required field has something in it (spaces do not count)', () => {
    expect(requiredFieldsFilled(EMPTY_USER_FORM, 'create')).toBe(false);
    expect(requiredFieldsFilled({ ...filled, phone: '' }, 'create')).toBe(true);
    for (const field of ['email', 'firstName', 'lastName', 'roleId', 'password'] as const) {
      expect(requiredFieldsFilled({ ...filled, [field]: '   ' }, 'create')).toBe(false);
    }
    expect(requiredFieldsFilled({ ...filled, email: '', password: '' }, 'edit')).toBe(true);
    expect(requiredFieldsFilled({ ...filled, firstName: '' }, 'edit')).toBe(false);
  });
});

describe('passwordProblems', () => {
  it('accepts 10 or more characters with an uppercase letter, a lowercase letter, a digit and a special character', () => {
    expect(passwordProblems('Correct-horse-9battery')).toEqual([]);
    expect(passwordProblems('Abcdefgh1!')).toEqual([]);
  });

  it('names each missing kind of character', () => {
    expect(passwordProblems('abcdefgh1!')).toEqual(['The password needs an uppercase letter.']);
    expect(passwordProblems('ABCDEFGH1!')).toEqual(['The password needs a lowercase letter.']);
    expect(passwordProblems('Abcdefghi!')).toEqual(['The password needs a digit.']);
    expect(passwordProblems('Abcdefgh12')).toEqual(['The password needs a special character, such as !']);
    expect(passwordProblems('Abcdefgh1 ')).toEqual(['The password needs a special character, such as !']); // a space is not special
  });

  it('refuses a short password and one longer than 72 bytes', () => {
    expect(passwordProblems('Abcdefg1!')).toEqual(['The password must be at least 10 characters long.']);
    expect(passwordProblems('Aa1!' + 'a'.repeat(69))).toEqual(['The password must be at most 72 bytes long.']);
    expect(passwordProblems('Aa1!' + 'š'.repeat(40))).toEqual(['The password must be at most 72 bytes long.']); // 84 bytes
  });
});

describe('validateUserField (shown when the field loses focus)', () => {
  it('email: required, trimmed and lowercased before the format check', () => {
    expect(validateUserField('email', { ...filled, email: '' }, 'create')).toBe('Email is required.');
    expect(validateUserField('email', { ...filled, email: 'nope' }, 'create')).toBe('Enter a valid email address.');
    expect(validateUserField('email', { ...filled, email: ' Ana@Example.COM ' }, 'create')).toBeUndefined();
    expect(validateUserField('email', { ...filled, email: '' }, 'edit')).toBeUndefined(); // never changes
  });

  it('names: required and at most 100 characters', () => {
    expect(validateUserField('firstName', { ...filled, firstName: ' ' }, 'create')).toBe('First name is required.');
    expect(validateUserField('lastName', { ...filled, lastName: '' }, 'create')).toBe('Last name is required.');
    expect(validateUserField('firstName', { ...filled, firstName: 'x'.repeat(101) }, 'create')).toBe('First name is too long (100 characters at most).');
  });

  it('phone: optional, 6 to 15 digits with an optional leading +, no spaces', () => {
    expect(validateUserField('phone', { ...filled, phone: '' }, 'create')).toBeUndefined();
    expect(validateUserField('phone', { ...filled, phone: '0601234567' }, 'create')).toBeUndefined();
    expect(validateUserField('phone', { ...filled, phone: '+381 60 123' }, 'create')).toBe('Enter 6 to 15 digits, optionally starting with +, and no spaces.');
    expect(validateUserField('phone', { ...filled, phone: '12345' }, 'create')).toBe('Enter 6 to 15 digits, optionally starting with +, and no spaces.');
  });

  it('role: required', () => {
    expect(validateUserField('roleId', { ...filled, roleId: '' }, 'create')).toBe('Role is required.');
    expect(validateUserField('roleId', { ...filled, roleId: '2' }, 'create')).toBeUndefined();
  });

  it('password: required and checked on create; on edit empty means keep the current one, anything typed is checked', () => {
    expect(validateUserField('password', { ...filled, password: '' }, 'create')).toBe(
      'The password must be at least 10 characters long. The password needs an uppercase letter. The password needs a lowercase letter. The password needs a digit. The password needs a special character, such as !',
    );
    expect(validateUserField('password', { ...filled, password: '' }, 'edit')).toBeUndefined();
    expect(validateUserField('password', { ...filled, password: 'short' }, 'edit')).toContain('at least 10');
    expect(validateUserField('password', filled, 'create')).toBeUndefined();
  });
});

describe('validateUserForm', () => {
  it('is empty for a good form and has one message per bad field otherwise', () => {
    expect(validateUserForm(filled, 'create')).toEqual({});
    expect(Object.keys(validateUserForm(EMPTY_USER_FORM, 'create')).sort()).toEqual(['email', 'firstName', 'lastName', 'password', 'roleId']);
    expect(validateUserForm({ ...filled, email: 'nope', phone: '12' }, 'create')).toEqual({
      email: 'Enter a valid email address.',
      phone: 'Enter 6 to 15 digits, optionally starting with +, and no spaces.',
    });
  });

  it('the edit form of an existing user is valid as it is', () => {
    expect(validateUserForm(userFormFromUser(saved, roles), 'edit')).toEqual({});
  });
});

describe('userFormFromUser', () => {
  it('fills the form from the user, the role by its name, an empty password and an empty phone for none', () => {
    expect(userFormFromUser(saved, roles)).toEqual({ ...filled, password: '' });
    expect(userFormFromUser({ ...saved, phone: null }, roles).phone).toBe('');
    expect(userFormFromUser({ ...saved, role: 'unknown_role' }, roles).roleId).toBe('');
  });
});

describe('toCreateUserRequest', () => {
  it('trims, lowercases the email, turns an empty phone into null and keeps the password as typed', () => {
    expect(
      toCreateUserRequest({ email: ' Ana@Example.COM ', firstName: ' Ana ', lastName: 'Petrovic ', phone: '  ', roleId: ' 3 ', password: ' Pass-word-12 ' }),
    ).toEqual({ email: 'ana@example.com', firstName: 'Ana', lastName: 'Petrovic', phone: null, roleId: '3', password: ' Pass-word-12 ' });
  });
});

describe('toUpdateUserRequest', () => {
  const same = userFormFromUser(saved, roles);

  it('is null when nothing changed', () => {
    expect(toUpdateUserRequest(saved, roles, same, true)).toBeNull();
    expect(toUpdateUserRequest(saved, roles, { ...same, firstName: ' Ana ' }, true)).toBeNull(); // spaces only
  });

  it('sends only the fields that differ', () => {
    expect(toUpdateUserRequest(saved, roles, { ...same, firstName: 'Anka' }, true)).toEqual({ id: '9', firstName: 'Anka' });
    expect(toUpdateUserRequest(saved, roles, { ...same, roleId: '2', lastName: 'Jovic' }, true)).toEqual({ id: '9', lastName: 'Jovic', roleId: '2' });
    expect(toUpdateUserRequest(saved, roles, same, false)).toEqual({ id: '9', isActive: false });
  });

  it('an emptied phone becomes null, a typed phone replaces it, and a typed password is sent', () => {
    expect(toUpdateUserRequest(saved, roles, { ...same, phone: '' }, true)).toEqual({ id: '9', phone: null });
    expect(toUpdateUserRequest({ ...saved, phone: null }, roles, { ...same, phone: '+38164111222' }, true)).toEqual({ id: '9', phone: '+38164111222' });
    expect(toUpdateUserRequest(saved, roles, { ...same, password: 'New-password-77!' }, true)).toEqual({ id: '9', password: 'New-password-77!' });
  });
});
