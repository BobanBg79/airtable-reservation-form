import type { NewUserRequest, RoleOption, UserSummary, UserUpdateRequest } from './types';

// The rules of the user forms, for the screens (a message under a field on blur, Save disabled until the required
// fields are filled). The server checks the same rules again and is the source of truth: it lives in api/
// (_userInput.js, _password.js), which cannot import this package, so scripts/user-rules-parity.test.mjs runs both
// on the same inputs and fails if they ever disagree. Pure TypeScript: no React, no UI.

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes
export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 100;

// The same patterns as the CHECK constraints of the users table (db/schema.ts).
const EMAIL_PATTERN = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const PHONE_PATTERN = /^[+]?[0-9]{6,15}$/;

export type UserFormMode = 'create' | 'edit';
export type UserFormField = 'email' | 'firstName' | 'lastName' | 'phone' | 'roleId' | 'password';
export type UserFormErrors = Partial<Record<UserFormField, string>>;

/** What the user typed. Everything is text, as in the inputs; `roleId` is the id chosen in the dropdown. */
export type UserFormValues = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleId: string;
  password: string;
};

export const EMPTY_USER_FORM: UserFormValues = { email: '', firstName: '', lastName: '', phone: '', roleId: '', password: '' };

/** The form of an existing user, for editing. The password is always empty: it is never shown. */
export function userFormFromUser(user: UserSummary, roles: readonly RoleOption[]): UserFormValues {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
    roleId: roles.find((r) => r.name === user.role)?.id ?? '',
    password: '',
  };
}

/** The fields marked as required (with a star). The email is not a field of the edit form: it never changes. */
export function requiredFields(mode: UserFormMode): UserFormField[] {
  return mode === 'create' ? ['email', 'firstName', 'lastName', 'roleId', 'password'] : ['firstName', 'lastName', 'roleId'];
}

export function isRequired(field: UserFormField, mode: UserFormMode): boolean {
  return requiredFields(mode).includes(field);
}

/** True when every required field has something in it. Save stays disabled until then. */
export function requiredFieldsFilled(values: UserFormValues, mode: UserFormMode): boolean {
  return requiredFields(mode).every((field) => values[field].trim() !== '');
}

/** Length in UTF-8 bytes (a letter such as "š" takes two). */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Problems with a password, as short messages (empty = acceptable): at least 10 characters with an uppercase
 * letter, a lowercase letter, a digit and a special character (anything that is not a letter, a digit or
 * whitespace, such as "!").
 */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  else if (utf8Length(password) > MAX_PASSWORD_BYTES) problems.push(`The password must be at most ${MAX_PASSWORD_BYTES} bytes long.`);
  if (!/\p{Lu}/u.test(password)) problems.push('The password needs an uppercase letter.');
  if (!/\p{Ll}/u.test(password)) problems.push('The password needs a lowercase letter.');
  if (!/\p{Nd}/u.test(password)) problems.push('The password needs a digit.');
  if (!/[^\p{L}\p{Nd}\s]/u.test(password)) problems.push('The password needs a special character, such as !');
  return problems;
}

/** The message for one field, or undefined when it is fine. Used when the user leaves the field (blur). */
export function validateUserField(field: UserFormField, values: UserFormValues, mode: UserFormMode): string | undefined {
  const value = values[field];
  switch (field) {
    case 'email': {
      if (mode === 'edit') return undefined; // never changes, never sent
      const email = value.trim().toLowerCase();
      if (!email) return 'Email is required.';
      return email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email) ? 'Enter a valid email address.' : undefined;
    }
    case 'firstName':
    case 'lastName': {
      const label = field === 'firstName' ? 'First name' : 'Last name';
      const name = value.trim();
      if (!name) return `${label} is required.`;
      return name.length > MAX_NAME_LENGTH ? `${label} is too long (${MAX_NAME_LENGTH} characters at most).` : undefined;
    }
    case 'phone': {
      const phone = value.trim();
      return phone === '' || PHONE_PATTERN.test(phone) ? undefined : 'Enter 6 to 15 digits, optionally starting with +, and no spaces.';
    }
    case 'roleId':
      return value.trim() === '' ? 'Role is required.' : undefined;
    case 'password': {
      // Required when creating; when editing an empty password means "keep the current one".
      if (mode === 'edit' && value === '') return undefined;
      const problems = passwordProblems(value);
      return problems.length ? problems.join(' ') : undefined;
    }
  }
}

/** The messages for the whole form (what Save checks before it sends anything). */
export function validateUserForm(values: UserFormValues, mode: UserFormMode): UserFormErrors {
  const fields: UserFormField[] = ['email', 'firstName', 'lastName', 'phone', 'roleId', 'password'];
  const errors: UserFormErrors = {};
  for (const field of fields) {
    const message = validateUserField(field, values, mode);
    if (message) errors[field] = message;
  }
  return errors;
}

/** The body of POST /api/users/create. Call it only for a form that passed validateUserForm. */
export function toCreateUserRequest(values: UserFormValues): NewUserRequest {
  const phone = values.phone.trim();
  return {
    email: values.email.trim().toLowerCase(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    phone: phone === '' ? null : phone,
    roleId: values.roleId.trim(),
    password: values.password,
  };
}

/**
 * The body of POST /api/users/edit with only what differs from the saved user, or null when nothing changed
 * (so the screen can say so instead of sending an empty edit). `isActive` is the state of the switch.
 */
export function toUpdateUserRequest(
  user: UserSummary,
  roles: readonly RoleOption[],
  values: UserFormValues,
  isActive: boolean,
): UserUpdateRequest | null {
  const request: UserUpdateRequest = { id: user.id };
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const phone = values.phone.trim() === '' ? null : values.phone.trim();
  const roleId = values.roleId.trim();
  if (firstName !== user.firstName) request.firstName = firstName;
  if (lastName !== user.lastName) request.lastName = lastName;
  if (phone !== user.phone) request.phone = phone;
  if (roleId !== (roles.find((r) => r.name === user.role)?.id ?? '')) request.roleId = roleId;
  if (isActive !== user.isActive) request.isActive = isActive;
  if (values.password !== '') request.password = values.password;
  return Object.keys(request).length > 1 ? request : null;
}
